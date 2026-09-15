import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';

/**
 * MDM / Managed Tablets proxy.
 * ---------------------------------------------------------------------------
 * Fronts the ApexMSP VNC relay (Android kiosk fleet) so the browser never
 * holds the relay admin token. Configured via env on the control plane:
 *   RELAY_URL          where THIS server reaches the relay (may be loopback/on-box)
 *   RELAY_PUBLIC_URL   browser-facing relay origin for viewer links (public)
 *   RELAY_ADMIN_TOKEN  the relay ADMIN_TOKEN (kept server-side only)
 * The relay's GET /api/devices already returns a ready per-device viewUrl
 * (short-lived view token minted relay-side), so we never mint tokens here.
 */

const router = Router();
router.use(authenticate);

// RELAY_URL: where THIS server reaches the relay (may be an on-box/loopback address).
// RELAY_PUBLIC_URL: the browser-facing origin used to build viewer links (must be public).
const RELAY_URL = (process.env.RELAY_URL || 'https://vnc.apexmsp.app').replace(/\/+$/, '');
const RELAY_PUBLIC_URL = (process.env.RELAY_PUBLIC_URL || 'https://vnc.apexmsp.app').replace(/\/+$/, '');
const RELAY_ADMIN_TOKEN = process.env.RELAY_ADMIN_TOKEN || '';

interface RelayDevice {
  device: string;
  name?: string;
  model?: string;
  connectedAt?: number;
  viewUrl?: string;
}

async function relayFetch(path: string, init?: RequestInit): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${RELAY_URL}${path}${sep}k=${encodeURIComponent(RELAY_ADMIN_TOKEN)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/v1/mdm/devices — live Android/kiosk tablets currently on the relay
router.get('/devices', async (_req: AuthenticatedRequest, res) => {
  if (!RELAY_ADMIN_TOKEN) {
    res.json({ configured: false, devices: [] });
    return;
  }
  try {
    const r = await relayFetch('/api/devices');
    if (!r.ok) {
      res.status(502).json({ configured: true, error: `relay ${r.status}`, devices: [] });
      return;
    }
    const data = (await r.json()) as { devices?: RelayDevice[] };
    const devices = (data.devices || []).map((d) => {
      const c = store.mdmClients.get(d.device);
      return {
        id: d.device,
        name: d.name || d.device,
        model: d.model || '',
        connectedAt: d.connectedAt || 0,
        online: true,
        clientId: c?.clientId || null,
        clientName: c?.clientName || '',
        viewerUrl: d.viewUrl ? `${RELAY_PUBLIC_URL}${d.viewUrl}` : null
      };
    });
    res.json({ configured: true, devices });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'relay unreachable';
    res.status(502).json({ configured: true, error: message, devices: [] });
  }
});

// PATCH /api/v1/mdm/devices/:id/name — set friendly display name (persists relay-side)
router.patch('/devices/:id/name', async (req: AuthenticatedRequest, res) => {
  if (!RELAY_ADMIN_TOKEN) {
    res.status(400).json({ error: 'MDM relay not configured' });
    return;
  }
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  try {
    const r = await relayFetch('/api/name', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: req.params.id, name })
    });
    if (!r.ok) {
      res.status(502).json({ error: `relay ${r.status}` });
      return;
    }
    res.json({ ok: true, id: req.params.id, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'relay unreachable';
    res.status(502).json({ error: message });
  }
});

export default router;
