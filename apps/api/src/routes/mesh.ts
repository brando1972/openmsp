import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { meshClient, type MeshNode } from '../mesh/meshClient.js';
import type { ManagedDevice } from '@openmsp/api-types';

/**
 * Native ApexConnect remote-desktop control plane + device monitoring.
 * ---------------------------------------------------------------------------
 * - POST /session   — broker a native KVM session (see ApexConnectDesktop.tsx)
 * - GET  /nodes     — reachable devices, enriched with RMM health
 * - GET  /thumbnail — server-captured desktop screenshot (JPEG), cached
 * - GET  /health    — engine status
 */

const router = Router();
router.use(authenticate);

// Match a MeshCentral node to its RMM device (separate agents; correlate by hostname/name).
function rmmDeviceForNode(node: MeshNode): ManagedDevice | null {
  const names = [node.name, node.rname].map((s) => (s || '').toLowerCase());
  const bare = names.map((s) => s.split('.')[0]);
  for (const d of store.devices.values()) {
    const cands = [d.hostname, d.name].filter(Boolean).map((x) => (x as string).toLowerCase());
    if (cands.some((c) => names.includes(c) || bare.includes(c.split('.')[0]))) return d;
  }
  return null;
}

// Resolve a target nodeid from an explicit nodeid or a console deviceId.
function resolveNodeId(deviceId: string, explicit: string): string {
  if (explicit) return explicit;
  if (!deviceId) return '';
  const mapped = store.meshNodes.get(deviceId);
  if (mapped) return mapped;
  const device = store.devices.get(deviceId);
  if (device) {
    const node = meshClient.resolveNode([device.hostname, device.name].filter(Boolean) as string[]);
    if (node) { store.meshNodes.set(deviceId, node.nodeid); return node.nodeid; }
  }
  return '';
}

router.get('/health', (_req: AuthenticatedRequest, res) => {
  res.json(meshClient.status());
});

// GET /api/v1/mesh/nodes — reachable devices + RMM health + thumbnail freshness
router.get('/nodes', async (_req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.json({ configured: false, connected: false, nodes: [] }); return; }
  try { await meshClient.ensureReady(); }
  catch (err) {
    res.json({ configured: true, connected: false, error: err instanceof Error ? err.message : 'not ready', nodes: [] });
    return;
  }
  const nodes = await Promise.all(meshClient.listNodes().map(async (n) => {
    const d = rmmDeviceForNode(n);
    const thumb = meshClient.getThumb(n.nodeid);
    // Pull hardware telemetry from the MeshCentral agent (works even without the RMM agent).
    const telemetry = n.online ? await meshClient.getTelemetry(n.nodeid) : null;
    return {
      nodeid: n.nodeid,
      name: n.name,
      rname: n.rname,
      host: n.host,
      online: n.online,
      deviceId: d?.id || null,
      clientName: d?.clientName || '',
      os: d?.os || (telemetry?.os ? (/windows/i.test(telemetry.os) ? 'windows' : 'macos') : (n.rname && n.rname !== n.name ? 'windows' : 'macos')),
      serial: d?.serialNumber || telemetry?.serial || '',
      health: d
        ? {
            status: d.health,
            cpu: d.metrics?.cpuUsage ?? null,
            ram: d.metrics?.ramUsage ?? null,
            disk: d.metrics?.diskUsage ?? null,
            uptimeDays: d.metrics?.uptimeDays ?? null,
            lastSeen: d.metrics?.lastSeen ?? null
          }
        : null,
      telemetry,
      thumbAt: thumb ? thumb.ts : null
    };
  }));
  res.json({ configured: true, connected: true, nodes });
});

// POST /api/v1/mesh/session — start a native remote-desktop session
router.post('/session', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).json({ error: 'ApexConnect remote engine not configured' }); return; }
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
  const explicit = typeof req.body?.nodeid === 'string' ? req.body.nodeid : '';
  try { await meshClient.ensureReady(); }
  catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : 'remote engine unreachable' }); return; }

  const nodeid = resolveNodeId(deviceId, explicit);
  if (!nodeid) {
    res.status(404).json({ error: 'No ApexConnect agent found for this device. Install/enroll the agent.' });
    return;
  }
  const node = meshClient.getNode(nodeid);
  const device = deviceId ? store.devices.get(deviceId) : undefined;
  const deviceName = device?.name || node?.name || node?.rname || nodeid;
  try {
    const session = await meshClient.openDesktopSession(nodeid, 2);
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'remote.desktop_start', targetType: 'device', targetId: deviceId || nodeid,
      details: { nodeid, transport: 'apexconnect-native', deviceName }, ipAddress: req.ip
    });
    res.json({ ...session, deviceName, online: node ? node.online : true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'failed to open remote session' });
  }
});

// GET /api/v1/mesh/thumbnail?nodeid=..|deviceId=..&maxAge=<sec>&refresh=1
router.get('/thumbnail', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).end(); return; }
  try { await meshClient.ensureReady(); } catch { res.status(502).end(); return; }
  const nodeid = resolveNodeId(
    typeof req.query.deviceId === 'string' ? req.query.deviceId : '',
    typeof req.query.nodeid === 'string' ? req.query.nodeid : ''
  );
  if (!nodeid) { res.status(404).end(); return; }
  const maxAge = Math.max(30, parseInt(String(req.query.maxAge || '300'), 10) || 300) * 1000;
  const force = req.query.refresh === '1';

  let entry = meshClient.getThumb(nodeid);
  if (force || !entry || Date.now() - entry.ts > maxAge) {
    entry = await meshClient.captureThumbnail(nodeid);
  }
  if (!entry) { res.status(204).end(); return; }
  res.setHeader('content-type', 'image/jpeg');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-captured-at', String(entry.ts));
  res.end(entry.buf);
});

export default router;
