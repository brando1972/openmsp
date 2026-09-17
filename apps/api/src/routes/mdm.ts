import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { captureRelayThumb, getRelayThumb } from '../mesh/relayCapture.js';
import {
  hmdmConfigured, getDeviceBySerial, getTelemetry, listConfigs, setConfig, reboot as hmdmReboot, cloneConfig,
  listDevices, getConfigsDetailed, getConfig, createConfig, updateConfig, listApplications, listFiles,
  getConfigApps, getAvailableApps, addConfigApp, removeConfigApp, setConfigApp,
  getConfigFiles, getAvailableFiles, addConfigFile, removeConfigFile, setConfigFile
} from '../mdm/hmdm.js';

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
    const liveSerials = new Set<string>();
    const devices = (data.devices || []).map((d) => {
      liveSerials.add(d.device);
      const c = store.mdmClients.get(d.device);
      // Remember the friendly name/model so the tablet still shows (offline) when it disconnects.
      if (c && (d.name || d.model)) {
        store.mdmClients.set(d.device, { ...c, name: d.name || c.name, model: d.model || c.model });
      }
      return {
        id: d.device,
        name: d.name || c?.name || d.device,
        model: d.model || c?.model || '',
        connectedAt: d.connectedAt || 0,
        online: true,
        clientId: c?.clientId || null,
        clientName: c?.clientName || '',
        viewerUrl: d.viewUrl ? `${RELAY_PUBLIC_URL}${d.viewUrl}` : null
      };
    });
    // Surface known tablets that aren't currently on the relay as offline cards,
    // so a managed tablet never just disappears when it drops off.
    for (const [serial, c] of store.mdmClients) {
      if (liveSerials.has(serial)) continue;
      devices.push({
        id: serial,
        name: c.name || serial,
        model: c.model || '',
        connectedAt: 0,
        online: false,
        clientId: c.clientId || null,
        clientName: c.clientName || '',
        viewerUrl: null
      });
    }
    res.json({ configured: true, devices });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'relay unreachable';
    res.status(502).json({ configured: true, error: message, devices: [] });
  }
});

// GET /api/v1/mdm/thumbnail?device=<serial>&maxAge=<sec>&refresh=1 — tablet screenshot (JPEG)
router.get('/thumbnail', async (req: AuthenticatedRequest, res) => {
  const device = typeof req.query.device === 'string' ? req.query.device : '';
  if (!RELAY_ADMIN_TOKEN || !device) { res.status(404).end(); return; }
  const maxAge = Math.max(30, parseInt(String(req.query.maxAge || '300'), 10) || 300) * 1000;
  const force = req.query.refresh === '1';

  let entry = getRelayThumb(device);
  if (force || !entry || Date.now() - entry.ts > maxAge) {
    // Need a live view token from the relay (only present while the device is connected).
    let token = '';
    try {
      const r = await relayFetch('/api/devices');
      if (r.ok) {
        const data = (await r.json()) as { devices?: RelayDevice[] };
        const dev = (data.devices || []).find((d) => d.device === device);
        const m = dev?.viewUrl?.match(/[?&]t=([^&]+)/);
        if (m) token = decodeURIComponent(m[1]);
      }
    } catch { /* ignore */ }
    if (token) {
      const wsBase = RELAY_URL.replace(/^http/, 'ws') + '/view';
      entry = await captureRelayThumb(wsBase, device, token);
    }
  }
  if (!entry) { res.status(204).end(); return; }
  res.setHeader('content-type', 'image/jpeg');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-captured-at', String(entry.ts));
  res.end(entry.buf);
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

// GET /api/v1/mdm/devices/:id/details — Headwind profile + live telemetry for a tablet.
// :id is the relay/hardware serial (e.g. HNQ01Q1C).
router.get('/devices/:id/details', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  if (!hmdmConfigured()) { res.json({ configured: false, profiles: [] }); return; }
  const device = await getDeviceBySerial(serial);
  const profiles = await listConfigs();
  const telemetry = device ? await getTelemetry(device.id) : null;
  res.json({ configured: true, device, telemetry, profiles });
});

// POST /api/v1/mdm/devices/:id/profile — set the tablet's Headwind configuration ("profile").
// Body: { configId }. Swaps devices.configurationid in Headwind; the device applies it on next sync.
router.post('/devices/:id/profile', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const configId = parseInt(String(req.body?.configId), 10);
  if (!hmdmConfigured()) { res.status(503).json({ error: 'Headwind not configured' }); return; }
  if (!Number.isFinite(configId)) { res.status(400).json({ error: 'configId required' }); return; }
  const device = await getDeviceBySerial(serial);
  if (!device) { res.status(404).json({ error: 'device not found in Headwind' }); return; }
  const ok = await setConfig(device.id, configId);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.set_profile', targetType: 'device', targetId: serial,
    details: { configId, hmdmDeviceId: device.id }, ipAddress: req.ip
  });
  res.status(ok ? 200 : 502).json({ ok, configId });
});

// POST /api/v1/mdm/devices/:id/reboot — queue a remote reboot for the tablet via Headwind.
router.post('/devices/:id/reboot', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  if (!hmdmConfigured()) { res.status(503).json({ error: 'Headwind not configured' }); return; }
  const device = await getDeviceBySerial(serial);
  if (!device) { res.status(404).json({ error: 'device not found in Headwind' }); return; }
  const ok = await hmdmReboot(device.id);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.reboot', targetType: 'device', targetId: serial,
    details: { hmdmDeviceId: device.id }, ipAddress: req.ip
  });
  res.status(ok ? 200 : 502).json({ ok });
});

// POST /api/v1/mdm/profiles — create a new profile by cloning an existing configuration.
// Body: { name, baseConfigId, kioskMode }.
router.post('/profiles', async (req: AuthenticatedRequest, res) => {
  if (!hmdmConfigured()) { res.status(503).json({ error: 'Headwind not configured' }); return; }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const baseConfigId = parseInt(String(req.body?.baseConfigId), 10);
  const kioskMode = !!req.body?.kioskMode;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  if (!Number.isFinite(baseConfigId)) { res.status(400).json({ error: 'baseConfigId required' }); return; }
  const created = await cloneConfig(baseConfigId, name, kioskMode);
  if (!created) { res.status(502).json({ error: 'failed to create profile' }); return; }
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.create_profile', targetType: 'config', targetId: String(created.id),
    details: { name: created.name, baseConfigId, kioskMode }, ipAddress: req.ip
  });
  res.json({ ok: true, profile: created });
});

// ---------------------------------------------------------------------------
// Native MDM module (no-iframe console screens) — Devices / Configurations /
// Applications / Files, backed directly by the Headwind DB (hmdm.ts).
// ---------------------------------------------------------------------------
const QR_PUBLIC_BASE = (process.env.HMDM_PUBLIC_URL || 'https://android.apexmsp.app').replace(/\/+$/, '');

// GET /api/v1/mdm/native/overview — summary stats for the MDM home.
router.get('/native/overview', async (_req: AuthenticatedRequest, res) => {
  if (!hmdmConfigured()) { res.json({ configured: false }); return; }
  const [devices, configs, apps] = await Promise.all([listDevices(), getConfigsDetailed(), listApplications()]);
  res.json({
    configured: true,
    deviceCount: devices.length,
    onlineCount: devices.filter((d) => d.online).length,
    configCount: configs.length,
    appCount: apps.filter((a) => !a.system).length,
    recent: devices.slice(0, 6)
  });
});

// GET /api/v1/mdm/native/devices
router.get('/native/devices', async (_req: AuthenticatedRequest, res) => {
  res.json({ devices: hmdmConfigured() ? await listDevices() : [] });
});

// GET /api/v1/mdm/native/applications
router.get('/native/applications', async (_req: AuthenticatedRequest, res) => {
  res.json({ applications: hmdmConfigured() ? await listApplications() : [] });
});

// GET /api/v1/mdm/native/files
router.get('/native/files', async (_req: AuthenticatedRequest, res) => {
  res.json({ files: hmdmConfigured() ? await listFiles() : [] });
});

// GET /api/v1/mdm/native/configurations
router.get('/native/configurations', async (_req: AuthenticatedRequest, res) => {
  const configs = hmdmConfigured() ? await getConfigsDetailed() : [];
  res.json({ configurations: configs, qrBase: QR_PUBLIC_BASE });
});

// GET /api/v1/mdm/native/configurations/:id
router.get('/native/configurations/:id', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const cfg = Number.isFinite(id) && hmdmConfigured() ? await getConfig(id) : null;
  if (!cfg) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ configuration: cfg, qrBase: QR_PUBLIC_BASE });
});

// POST /api/v1/mdm/native/configurations — create a new profile (clone kiosk template + WiFi + start URL/PIN + QR).
router.post('/native/configurations', async (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  if (!hmdmConfigured()) { res.status(503).json({ error: 'MDM not configured' }); return; }
  const created = await createConfig({
    name,
    wifiSsid: b.wifiSsid ? String(b.wifiSsid) : undefined,
    wifiPassword: b.wifiPassword ? String(b.wifiPassword) : undefined,
    wifiSecurity: b.wifiSecurity ? String(b.wifiSecurity) : undefined,
    startUrl: b.startUrl ? String(b.startUrl) : undefined,
    adminPin: b.adminPin ? String(b.adminPin) : undefined,
    baseId: Number.isFinite(parseInt(String(b.baseId), 10)) ? parseInt(String(b.baseId), 10) : undefined
  });
  if (!created) { res.status(502).json({ error: 'failed to create configuration' }); return; }
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.native_create_config', targetType: 'config', targetId: String(created.id),
    details: { name, wifiSsid: b.wifiSsid || '' }, ipAddress: req.ip
  });
  res.status(201).json({ ok: true, id: created.id, qrcodeKey: created.qrcodeKey, qrBase: QR_PUBLIC_BASE });
});

// PUT /api/v1/mdm/native/configurations/:id — edit WiFi / start URL / PIN.
router.put('/native/configurations/:id', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const b = req.body || {};
  const tri = (v: any): 'any' | 'disabled' | 'enabled' | undefined =>
    v === 'any' || v === 'disabled' || v === 'enabled' ? v : undefined;
  const bnum = (v: any): number | undefined => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : undefined; };
  let policy: any = undefined;
  if (b.policy && typeof b.policy === 'object') {
    const pb = b.policy;
    policy = {
      description: pb.description !== undefined ? String(pb.description) : undefined,
      password: pb.password !== undefined ? String(pb.password) : undefined,
      gps: tri(pb.gps), bluetooth: tri(pb.bluetooth), wifi: tri(pb.wifi), mobileData: tri(pb.mobileData),
      blockUsbStorage: pb.blockUsbStorage !== undefined ? !!pb.blockUsbStorage : undefined,
      brightnessMode: ['none', 'value', 'auto'].includes(pb.brightnessMode) ? pb.brightnessMode : undefined,
      brightness: bnum(pb.brightness),
      manageTimeout: pb.manageTimeout !== undefined ? !!pb.manageTimeout : undefined, timeout: bnum(pb.timeout),
      manageVolume: pb.manageVolume !== undefined ? !!pb.manageVolume : undefined, volume: bnum(pb.volume),
      lockVolume: pb.lockVolume !== undefined ? !!pb.lockVolume : undefined,
      disableLocation: pb.disableLocation !== undefined ? !!pb.disableLocation : undefined,
      appPermissions: pb.appPermissions !== undefined ? String(pb.appPermissions) : undefined,
      pushOptions: pb.pushOptions !== undefined ? String(pb.pushOptions) : undefined
    };
  }
  let design: any = undefined;
  if (b.design && typeof b.design === 'object') {
    const db = b.design;
    design = {
      useDefault: db.useDefault !== undefined ? !!db.useDefault : undefined,
      backgroundColor: db.backgroundColor !== undefined ? String(db.backgroundColor) : undefined,
      textColor: db.textColor !== undefined ? String(db.textColor) : undefined,
      backgroundImageUrl: db.backgroundImageUrl !== undefined ? String(db.backgroundImageUrl) : undefined,
      iconSize: db.iconSize === 'LARGE' || db.iconSize === 'SMALL' ? db.iconSize : undefined,
      header: db.header === 'CUSTOM' || db.header === 'NO_HEADER' ? db.header : undefined,
      headerTemplate: db.headerTemplate !== undefined ? String(db.headerTemplate) : undefined
    };
  }
  const ok = await updateConfig(id, {
    wifiSsid: b.wifiSsid !== undefined ? String(b.wifiSsid) : undefined,
    wifiPassword: b.wifiPassword ? String(b.wifiPassword) : undefined,
    wifiSecurity: b.wifiSecurity !== undefined ? String(b.wifiSecurity) : undefined,
    startUrl: b.startUrl !== undefined ? String(b.startUrl) : undefined,
    adminPin: b.adminPin !== undefined ? String(b.adminPin) : undefined,
    policy, design
  });
  if (!ok) { res.status(502).json({ error: 'update failed' }); return; }
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.native_update_config', targetType: 'config', targetId: String(id), details: {}, ipAddress: req.ip
  });
  res.json({ ok: true });
});

// ---- Per-configuration application assignment (native Applications tab) -----
// GET /api/v1/mdm/native/configurations/:id/apps — assigned + available apps
router.get('/native/configurations/:id/apps', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const [assigned, available] = await Promise.all([getConfigApps(id), getAvailableApps(id)]);
  res.json({ assigned, available });
});

// POST /api/v1/mdm/native/configurations/:id/apps — assign an app { applicationId }
router.post('/native/configurations/:id/apps', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const appId = parseInt(String((req.body || {}).applicationId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(appId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const ok = await addConfigApp(id, appId);
  if (!ok) { res.status(502).json({ error: 'assign failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_add', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// PUT /api/v1/mdm/native/configurations/:id/apps/:appId — toggle showIcon / remove
router.put('/native/configurations/:id/apps/:appId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const appId = parseInt(String(req.params.appId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(appId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const b = req.body || {};
  const ok = await setConfigApp(id, appId, {
    showIcon: b.showIcon !== undefined ? !!b.showIcon : undefined,
    remove: b.remove !== undefined ? !!b.remove : undefined
  });
  if (!ok) { res.status(502).json({ error: 'update failed' }); return; }
  res.json({ ok: true });
});

// DELETE /api/v1/mdm/native/configurations/:id/apps/:appId — unassign
router.delete('/native/configurations/:id/apps/:appId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const appId = parseInt(String(req.params.appId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(appId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const ok = await removeConfigApp(id, appId);
  if (!ok) { res.status(502).json({ error: 'remove failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_remove', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// ---- Per-configuration file push (native Files tab) ------------------------
// GET /api/v1/mdm/native/configurations/:id/files — assigned + available files
router.get('/native/configurations/:id/files', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const [assigned, available] = await Promise.all([getConfigFiles(id), getAvailableFiles(id)]);
  res.json({ assigned, available });
});

// POST /api/v1/mdm/native/configurations/:id/files — assign a file { fileId, devicePath? }
router.post('/native/configurations/:id/files', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String((req.body || {}).fileId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(fileId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const ok = await addConfigFile(id, fileId, (req.body || {}).devicePath !== undefined ? String(req.body.devicePath) : undefined);
  if (!ok) { res.status(502).json({ error: 'assign failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_add', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// PUT /api/v1/mdm/native/configurations/:id/files/:fileId — device path / remove flag
router.put('/native/configurations/:id/files/:fileId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(fileId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const b = req.body || {};
  const ok = await setConfigFile(id, fileId, {
    devicePath: b.devicePath !== undefined ? String(b.devicePath) : undefined,
    remove: b.remove !== undefined ? !!b.remove : undefined
  });
  if (!ok) { res.status(502).json({ error: 'update failed' }); return; }
  res.json({ ok: true });
});

// DELETE /api/v1/mdm/native/configurations/:id/files/:fileId — unassign
router.delete('/native/configurations/:id/files/:fileId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(fileId) || !hmdmConfigured()) { res.status(400).json({ error: 'bad request' }); return; }
  const ok = await removeConfigFile(id, fileId);
  if (!ok) { res.status(502).json({ error: 'remove failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_remove', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
