import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { captureRelayThumb, getRelayThumb } from '../mesh/relayCapture.js';
import {
  hmdmConfigured, getDeviceBySerial, getTelemetry, listConfigs, setConfig, reboot as hmdmReboot, syncDevice as hmdmSync,
  runApp as hmdmRunApp, getRecoveryConfigId, getDeviceConfigIds, cloneConfig,
  listDevices, getConfigsDetailed, getConfig, createConfig, updateConfig, listApplications, listFiles,
  getConfigApps, getAvailableApps, addConfigApp, removeConfigApp, setConfigApp,
  getConfigFiles, getAvailableFiles, addConfigFile, removeConfigFile, setConfigFile
} from '../mdm/hmdm.js';
import { getMdmDevices, getMdmDevice, updateMdmDevice, setTargetTabletUrl } from '../db/mdmStore.js';

/**
 * MDM / Managed Tablets proxy.
 * ---------------------------------------------------------------------------
 * Fronts the ApexMSP VNC relay (Android kiosk fleet) so the browser never
 * holds the relay admin token. Configured via env on the control plane:
 *   RELAY_URL          where THIS server reaches the relay (may be loopback/on-box)
 *   RELAY_PUBLIC_URL   browser-facing relay origin for viewer links (public)
 *   RELAY_ADMIN_TOKEN  the relay ADMIN_TOKEN (kept server-side only)
 *   RELAY_SECRET       the relay shared secret for HMAC-SHA256 view tokens
 */

const router = Router();
router.use(authenticate);

// RELAY_URL: where THIS server reaches the relay (may be an on-box/loopback address).
// RELAY_PUBLIC_URL: the browser-facing origin used to build viewer links (must be public).
const RELAY_URL = (process.env.RELAY_URL || 'https://vnc.apexmsp.app').replace(/\/+$/, '');
const RELAY_PUBLIC_URL = (process.env.RELAY_PUBLIC_URL || 'https://vnc.apexmsp.app').replace(/\/+$/, '');
const RELAY_ADMIN_TOKEN = process.env.RELAY_ADMIN_TOKEN || 'cf34f946cf8001ce350bc64d074d4221';
const RELAY_SECRET = process.env.RELAY_SECRET || 'c8a50573e1a8075d0bb940f8aafbb24bd7b1076d60abfe99fafbcbf1b37ea023';

export function mintRelayViewToken(deviceId: string, secs: number = 12 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + secs;
  const sig = crypto.createHmac('sha256', RELAY_SECRET).update(`view:${deviceId}:${exp}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${exp}.${sig}`;
}

export function getRelayViewerUrl(deviceId: string): string {
  const token = mintRelayViewToken(deviceId);
  return `${RELAY_PUBLIC_URL}/?device=${encodeURIComponent(deviceId)}&t=${encodeURIComponent(token)}`;
}

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
  const devices: any[] = [];
  const liveSerials = new Set<string>();

  if (RELAY_ADMIN_TOKEN) {
    try {
      const r = await relayFetch('/api/devices');
      if (r.ok) {
        const data = (await r.json()) as { devices?: RelayDevice[] };
        for (const d of data.devices || []) {
          liveSerials.add(d.device);
          const c = store.mdmClients.get(d.device);
          if (c && (d.name || d.model)) {
            store.mdmClients.set(d.device, { ...c, name: d.name || c.name, model: d.model || c.model });
          }
          devices.push({
            id: d.device,
            name: d.name || c?.name || d.device,
            model: d.model || c?.model || '',
            connectedAt: d.connectedAt || 0,
            online: true,
            clientId: c?.clientId || null,
            clientName: c?.clientName || '',
            viewerUrl: d.viewUrl ? `${RELAY_PUBLIC_URL}${d.viewUrl}` : getRelayViewerUrl(d.device)
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Surface known tablets from local store
  const primaryClient = store.clients.get('c-brandon-ray') || Array.from(store.clients.values())[0];
  for (const [serial, c] of store.mdmClients) {
    if (serial === 'HNQ01Q1C' || c.name === 'Richs Auburn') continue;
    if (liveSerials.has(serial)) continue;
    const targetId = serial === 'apex-lenovo-01' ? '05c7cea3b3e2b8ba' : serial;
    const persistentDev = getMdmDevice(serial);
    const clientId = (c.clientId && c.clientId !== 'c-raytreat' && c.clientId !== 'c-richs') ? c.clientId : (primaryClient?.id || 'c-brandon-ray');
    const clientName = (c.clientName && c.clientId !== 'c-raytreat' && c.clientId !== 'c-richs') ? c.clientName : (primaryClient?.name || 'Brandon Ray');
    const cleanName = (c.name === 'Raytreat Lenovo Kiosk' || serial === 'apex-lenovo-01') ? 'Lenovo Tab TB373FU' : (c.name || serial);

    devices.push({
      id: serial,
      name: cleanName,
      model: c.model || 'Lenovo Tab TB373FU (Android 14)',
      connectedAt: persistentDev?.lastUpdate || 0,
      online: true,
      clientId,
      clientName,
      viewerUrl: getRelayViewerUrl(targetId)
    });
  }

  // Surface enrolled Lenovo tablet from persistent MDM store
  const persistentLenovo = getMdmDevice('apex-lenovo-01');
  const targetId = '05c7cea3b3e2b8ba';
  if (!devices.some(d => d.id === 'apex-lenovo-01' || d.id === 'HA1A99Z2' || d.id === targetId)) {
    const assigned = store.mdmClients.get('apex-lenovo-01');
    const clientId = (assigned?.clientId && assigned.clientId !== 'c-raytreat' && assigned.clientId !== 'c-richs') ? assigned.clientId : (primaryClient?.id || 'c-brandon-ray');
    const clientName = (assigned?.clientName && assigned.clientId !== 'c-raytreat' && assigned.clientId !== 'c-richs') ? assigned.clientName : (primaryClient?.name || 'Brandon Ray');

    devices.push({
      id: 'apex-lenovo-01',
      name: 'Lenovo Tab TB373FU',
      model: 'Lenovo Tab TB373FU (Android 14)',
      connectedAt: persistentLenovo?.lastUpdate || 0,
      online: true,
      clientId,
      clientName,
      viewerUrl: getRelayViewerUrl(targetId)
    });
  }

  res.json({ configured: true, devices });
});

// POST /api/v1/mdm/devices/:id/assign-client — bind a tablet to an MSP client
router.post('/devices/:id/assign-client', (req: AuthenticatedRequest, res) => {
  const serial = req.params.id as string;
  const clientId = String(req.body?.clientId || '');
  const client = store.clients.get(clientId);
  if (!client) {
    res.status(400).json({ error: 'Client not found' });
    return;
  }
  const existing = store.mdmClients.get(serial) || { clientId: '', clientName: '', name: serial };
  store.mdmClients.set(serial, {
    ...existing,
    clientId: client.id,
    clientName: client.name
  });
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.assign_client', targetType: 'device', targetId: serial,
    details: { clientId: client.id, clientName: client.name }, ipAddress: req.ip
  });
  res.json({ ok: true, serial, clientId: client.id, clientName: client.name });
});

// GET /api/v1/mdm/viewer-url or GET /api/v1/mdm/devices/:id/viewer-url
// Returns an authenticated, short-lived VNC remote control session URL for the requested tablet
router.get(['/viewer-url', '/devices/:id/viewer-url'], async (req: AuthenticatedRequest, res) => {
  const rawParam = req.params.id;
  const requestedId = String((Array.isArray(rawParam) ? rawParam[0] : rawParam) || (typeof req.query.device === 'string' ? req.query.device : 'apex-lenovo-01'));
  let targetDevice = requestedId;
  let liveViewUrl = '';

  if (RELAY_ADMIN_TOKEN) {
    try {
      const r = await relayFetch('/api/devices');
      if (r.ok) {
        const data = (await r.json()) as { devices?: RelayDevice[] };
        const devList = data.devices || [];
        // Direct match
        let dev = devList.find(d => d.device === requestedId);
        // Alias match for Lenovo TB373FU tablet
        if (!dev && (requestedId === 'apex-lenovo-01' || requestedId === 'HA1A99Z2')) {
          dev = devList.find(d => d.device === '05c7cea3b3e2b8ba' || (d.model && d.model.includes('TB373FU')) || d.device === 'HA1A99Z2');
        }
        if (dev) {
          targetDevice = dev.device;
          if (dev.viewUrl) {
            liveViewUrl = `${RELAY_PUBLIC_URL}${dev.viewUrl}`;
          }
        }
      }
    } catch { /* fallback to minting */ }
  }

  if (liveViewUrl) {
    res.json({ ok: true, deviceId: targetDevice, url: liveViewUrl });
    return;
  }

  if (targetDevice === 'apex-lenovo-01' || targetDevice === 'HA1A99Z2') {
    targetDevice = '05c7cea3b3e2b8ba';
  }

  const url = getRelayViewerUrl(targetDevice);
  res.json({ ok: true, deviceId: targetDevice, url });
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
    if (!token) {
      token = mintRelayViewToken(device);
    }
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

// POST /api/v1/mdm/devices/:id/profile — set the tablet's configuration ("profile").
router.post('/devices/:id/profile', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const configId = parseInt(String(req.body?.configId), 10);
  if (!Number.isFinite(configId)) { res.status(400).json({ error: 'configId required' }); return; }

  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === configId);
    if (!cfg) { res.status(404).json({ error: 'config not found' }); return; }
    setTargetTabletUrl(cfg.startUrl);
    updateMdmDevice(serial, {
      configId,
      configName: cfg.name,
      configKiosk: cfg.kioskMode,
      targetUrl: cfg.startUrl
    });
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.set_profile', targetType: 'device', targetId: serial,
      details: { configId, name: cfg.name, targetUrl: cfg.startUrl }, ipAddress: req.ip
    });
    return res.json({ ok: true, configId });
  }

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

// POST /api/v1/mdm/devices/:id/reboot — queue a remote reboot for the tablet.
router.post('/devices/:id/reboot', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  if (!hmdmConfigured()) {
    updateMdmDevice(serial, { pendingCommand: 'reboot' });
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.reboot', targetType: 'device', targetId: serial,
      details: {}, ipAddress: req.ip
    });
    return res.json({ ok: true });
  }

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

// POST /api/v1/mdm/devices/:id/sync — queue a config-refresh push.
router.post('/devices/:id/sync', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  if (!hmdmConfigured()) {
    updateMdmDevice(serial, { pendingCommand: 'sync', lastUpdate: Date.now() });
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.sync', targetType: 'device', targetId: serial,
      details: {}, ipAddress: req.ip
    });
    return res.json({ ok: true });
  }

  const device = await getDeviceBySerial(serial);
  if (!device) { res.status(404).json({ error: 'device not found in Headwind' }); return; }
  const ok = await hmdmSync(device.id);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.sync', targetType: 'device', targetId: serial,
    details: { hmdmDeviceId: device.id }, ipAddress: req.ip
  });
  res.status(ok ? 200 : 502).json({ ok });
});

// POST /api/v1/mdm/devices/:id/runapp — (re)launch an app on the tablet. Body: { pkg? } (default kiosk browser).
router.post('/devices/:id/runapp', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const pkg = String((req.body || {}).pkg || 'app.apexmsp.kiosk');
  if (!hmdmConfigured()) {
    updateMdmDevice(serial, { pendingCommand: `runapp:${pkg}` });
    store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.run_app', targetType: 'device', targetId: serial, details: { pkg }, ipAddress: req.ip });
    return res.json({ ok: true });
  }

  const device = await getDeviceBySerial(serial);
  if (!device) { res.status(404).json({ error: 'device not found in Headwind' }); return; }
  const ok = await hmdmRunApp(device.id, pkg);
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.run_app', targetType: 'device', targetId: serial, details: { pkg }, ipAddress: req.ip });
  res.status(ok ? 200 : 502).json({ ok });
});

// POST /api/v1/mdm/devices/:id/kiosk — lock into kiosk or unlock to Recovery. Body: { lock: boolean, configId? }.
router.post('/devices/:id/kiosk', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const lock = !!(req.body || {}).lock;

  if (!hmdmConfigured()) {
    const dev = getMdmDevice(serial);
    if (lock) {
      const targetConfigId = parseInt(String((req.body || {}).configId), 10) || dev?.oldConfigId || 1;
      const cfg = groundUpConfigs.find((c) => c.id === targetConfigId) || groundUpConfigs[0];
      setTargetTabletUrl(cfg.startUrl);
      updateMdmDevice(serial, {
        configId: cfg.id,
        configName: cfg.name,
        configKiosk: true,
        targetUrl: cfg.startUrl
      });
    } else {
      const recoveryCfg = groundUpConfigs.find((c) => !c.kioskMode) || groundUpConfigs[3] || groundUpConfigs[0];
      setTargetTabletUrl(recoveryCfg.startUrl);
      updateMdmDevice(serial, {
        oldConfigId: dev?.configId || 1,
        oldConfigKiosk: true,
        configId: recoveryCfg.id,
        configName: recoveryCfg.name,
        configKiosk: false,
        targetUrl: recoveryCfg.startUrl
      });
    }
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: lock ? 'mdm.kiosk_lock' : 'mdm.kiosk_unlock', targetType: 'device', targetId: serial,
      details: { lock }, ipAddress: req.ip
    });
    return res.json({ ok: true });
  }

  const device = await getDeviceBySerial(serial);
  if (!device) { res.status(404).json({ error: 'device not found in Headwind' }); return; }
  const configs = await getConfigsDetailed();
  const isKiosk = (cid: number | null) => !!cid && !!configs.find((c) => c.id === cid)?.kioskMode;
  let target: number | null = null;
  if (lock) {
    const bodyTarget = parseInt(String((req.body || {}).configId), 10);
    const { oldConfigId } = await getDeviceConfigIds(device.id);
    target = Number.isFinite(bodyTarget) && isKiosk(bodyTarget) ? bodyTarget
      : isKiosk(oldConfigId) ? oldConfigId
      : (configs.find((c) => c.kioskMode)?.id ?? null);
    if (!target) { res.status(409).json({ error: 'no kiosk profile to lock into — assign one from the dropdown' }); return; }
  } else {
    target = await getRecoveryConfigId();
    if (!target) { res.status(409).json({ error: 'Recovery profile not found' }); return; }
  }
  const ok = (await setConfig(device.id, target)) && (await hmdmSync(device.id));
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: lock ? 'mdm.kiosk_lock' : 'mdm.kiosk_unlock', targetType: 'device', targetId: serial, details: { target }, ipAddress: req.ip });
  res.status(ok ? 200 : 502).json({ ok, configId: target });
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
// Native ApexMDM module — Devices / Configurations / Applications / Files
// Backed by ground-up ApexMDM configuration store with Headwind fallback.
// ---------------------------------------------------------------------------
const QR_PUBLIC_BASE = (process.env.APEXMDM_PUBLIC_URL || process.env.API_PUBLIC_URL || 'https://api.apexmsp.app').replace(/\/+$/, '');

interface GroundUpConfig {
  id: number;
  name: string;
  description?: string;
  deviceCount: number;
  contentApp: string;
  kioskMode: boolean;
  wifiSsid: string;
  wifiSecurity: string;
  wifiPassword?: string;
  startUrl: string;
  adminPin: string;
  mobileEnrollment: boolean;
  qrcodeKey: string;
  policy?: any;
  design?: any;
  mdm?: any;
  assignedAppIds?: number[];
  assignedFileIds?: number[];
  appSettings?: Record<number, { showIcon?: boolean; remove?: boolean }>;
}

const CONFIGS_FILE = path.join(process.env.DATA_DIR || path.resolve(process.cwd(), '.data'), 'mdm-configs.json');

const defaultGroundUpConfigs: GroundUpConfig[] = [
  {
    id: 1,
    name: 'Raytreat Clinic Kiosk',
    description: 'Single-app locked web kiosk for clinical check-in tablets.',
    deviceCount: 1,
    contentApp: 'ApexBrowser (Web Kiosk)',
    kioskMode: true,
    wifiSsid: 'Raytreat',
    wifiSecurity: 'WPA',
    wifiPassword: '11073CoRd1',
    startUrl: 'https://raytreat.com',
    adminPin: '2468',
    mobileEnrollment: true,
    qrcodeKey: 'raytreat-kiosk-qr'
  },
  {
    id: 2,
    name: 'Warehouse Scanner & Logistics',
    description: 'Ruggedized scanning and barcode inventory tablet profile.',
    deviceCount: 0,
    contentApp: 'com.apexmsp.wms',
    kioskMode: true,
    wifiSsid: 'WH-Mesh-5G',
    wifiSecurity: 'WPA',
    startUrl: 'https://apexmsp.app/wms',
    adminPin: '2468',
    mobileEnrollment: true,
    qrcodeKey: 'warehouse-kiosk-qr'
  },
  {
    id: 3,
    name: 'Retail Point-of-Sale Register',
    description: 'Locked countertop register profile with dual-display support.',
    deviceCount: 0,
    contentApp: 'com.squareup',
    kioskMode: true,
    wifiSsid: 'Raytreat',
    wifiSecurity: 'WPA',
    startUrl: 'https://apexmsp.app/pos',
    adminPin: '2468',
    mobileEnrollment: true,
    qrcodeKey: 'pos-register-qr'
  },
  {
    id: 4,
    name: 'ApexMDM Full Browser & Recovery',
    description: 'Open browsing and recovery profile with remote assistance unlocked.',
    deviceCount: 0,
    contentApp: 'Standard Browser',
    kioskMode: false,
    wifiSsid: 'Raytreat',
    wifiSecurity: 'WPA',
    startUrl: 'https://google.com',
    adminPin: '2468',
    mobileEnrollment: true,
    qrcodeKey: 'recovery-qr'
  }
];

function loadGroundUpConfigs(): GroundUpConfig[] {
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[mdm] failed to load mdm-configs.json:', (e as Error).message);
  }
  const defaults = [...defaultGroundUpConfigs];
  try {
    fs.mkdirSync(path.dirname(CONFIGS_FILE), { recursive: true });
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(defaults, null, 2));
  } catch {}
  return defaults;
}

const groundUpConfigs: GroundUpConfig[] = loadGroundUpConfigs();

function saveGroundUpConfigs() {
  try {
    fs.mkdirSync(path.dirname(CONFIGS_FILE), { recursive: true });
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(groundUpConfigs, null, 2));
  } catch (e) {
    console.warn('[mdm] failed to persist mdm-configs.json:', (e as Error).message);
  }
}

const groundUpApps = [
  { id: 1, pkg: 'app.apexmsp.kiosk', name: 'ApexMDM Kiosk DPC', system: false, useKiosk: true, version: '1.0.0', url: '/dpc/latest.apk' },
  { id: 2, pkg: 'app.apexmsp.agent', name: 'ApexMSP Remote Control Agent', system: false, useKiosk: false, version: '1.0.3', url: '/api/v1/mdm/apks/apex-agent.apk' },
  { id: 3, pkg: 'net.christianbeier.droidvnc_ng', name: 'droidVNC-NG RFB Engine', system: false, useKiosk: false, version: '2.21.0', url: '/api/v1/mdm/apks/droidvnc-ng.apk' }
];

const groundUpFiles = [
  { id: 1, name: 'config.json', devicePath: '/Android/data/app.apexmsp.kiosk/files/config.json', description: 'ApexMDM Managed Policy Configuration', external: false },
  { id: 2, name: 'bootanimation.zip', devicePath: '/system/media/bootanimation.zip', description: 'ApexMSP Enterprise Boot Animation', external: true }
];

// GET /api/v1/mdm/native/overview — summary stats for the MDM home.
router.get('/native/overview', async (_req: AuthenticatedRequest, res) => {
  const configs = hmdmConfigured() ? await getConfigsDetailed() : groundUpConfigs;
  const devList = (hmdmConfigured() ? await listDevices() : null) || getMdmDevices();
  res.json({
    configured: true,
    deviceCount: devList.length,
    onlineCount: devList.filter((d: any) => d.online).length,
    configCount: (configs || groundUpConfigs).length,
    appCount: groundUpApps.length,
    recent: devList.slice(0, 6)
  });
});

// GET /api/v1/mdm/native/devices
router.get('/native/devices', async (_req: AuthenticatedRequest, res) => {
  let devList = hmdmConfigured() ? await listDevices() : [];
  if (!devList || devList.length === 0) {
    devList = getMdmDevices() as any;
  }
  res.json({ devices: devList });
});

// GET /api/v1/mdm/native/applications
router.get('/native/applications', async (_req: AuthenticatedRequest, res) => {
  const apps = hmdmConfigured() ? await listApplications() : [];
  res.json({ applications: apps.length > 0 ? apps : groundUpApps });
});

// GET /api/v1/mdm/native/files
router.get('/native/files', async (_req: AuthenticatedRequest, res) => {
  const files = hmdmConfigured() ? await listFiles() : [];
  res.json({ files: files.length > 0 ? files : groundUpFiles });
});

// GET /api/v1/mdm/native/configurations
router.get('/native/configurations', async (_req: AuthenticatedRequest, res) => {
  let configs = hmdmConfigured() ? await getConfigsDetailed() : [];
  if (!configs || configs.length === 0) {
    configs = groundUpConfigs as any;
  }
  res.json({ configurations: configs, qrBase: QR_PUBLIC_BASE });
});

// GET /api/v1/mdm/native/configurations/:id
router.get('/native/configurations/:id', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  let cfg = Number.isFinite(id) && hmdmConfigured() ? await getConfig(id) : null;
  if (!cfg) {
    cfg = groundUpConfigs.find((c) => c.id === id) as any;
  }
  if (!cfg) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ configuration: cfg, qrBase: QR_PUBLIC_BASE });
});

// POST /api/v1/mdm/native/configurations/:id/deploy — push configuration to device
router.post('/native/configurations/:id/deploy', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const cfg = groundUpConfigs.find((c) => c.id === id);
  const targetUrl = cfg?.startUrl || req.body?.startUrl || 'https://raytreat.com';
  const deviceId = String(req.body?.deviceId || 'apex-lenovo-01');

  setTargetTabletUrl(targetUrl);
  updateMdmDevice(deviceId, {
    configId: id,
    configName: cfg?.name || 'Custom Config',
    configKiosk: cfg?.kioskMode ?? true,
    targetUrl
  });

  try {
    await fetch('http://localhost:3001/api/v1/mdm/devices/' + deviceId + '/push-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });
  } catch {}

  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mdm.deploy_config', targetType: 'device', targetId: deviceId,
    details: { configId: id, configName: cfg?.name || 'Custom Config', targetUrl }, ipAddress: req.ip
  });

  res.json({ ok: true, deployedTo: deviceId, configId: id, targetUrl });
});

// POST /api/v1/mdm/native/configurations — create a new profile (clone kiosk template + WiFi + start URL/PIN + QR).
router.post('/native/configurations', async (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }

  if (!hmdmConfigured()) {
    const maxId = groundUpConfigs.reduce((m, c) => Math.max(m, c.id), 0);
    const newId = maxId + 1;
    const newConfig: GroundUpConfig = {
      id: newId,
      name,
      deviceCount: 0,
      contentApp: 'ApexBrowser (Web Kiosk)',
      kioskMode: true,
      wifiSsid: String(b.wifiSsid || 'Raytreat'),
      wifiSecurity: String(b.wifiSecurity || 'WPA'),
      wifiPassword: b.wifiPassword ? String(b.wifiPassword) : undefined,
      startUrl: String(b.startUrl || 'https://apexmsp.app'),
      adminPin: String(b.adminPin || '2468'),
      mobileEnrollment: true,
      qrcodeKey: `custom-config-${newId}-qr`,
      policy: b.policy,
      design: b.design,
      mdm: b.mdm
    };
    groundUpConfigs.push(newConfig);
    saveGroundUpConfigs();
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.native_create_config', targetType: 'config', targetId: String(newId),
      details: { name, wifiSsid: b.wifiSsid || '' }, ipAddress: req.ip
    });
    return res.status(201).json({ ok: true, id: newId, qrcodeKey: newConfig.qrcodeKey, qrBase: QR_PUBLIC_BASE });
  }

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
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'bad request' }); return; }

  const b = req.body || {};
  const native = groundUpConfigs.find((c) => c.id === id);
  if (native) {
    if (b.name) native.name = String(b.name);
    if (b.wifiSsid !== undefined) native.wifiSsid = String(b.wifiSsid);
    if (b.wifiPassword !== undefined) native.wifiPassword = String(b.wifiPassword);
    if (b.wifiSecurity !== undefined) native.wifiSecurity = String(b.wifiSecurity);
    if (b.startUrl !== undefined) native.startUrl = String(b.startUrl);
    if (b.adminPin !== undefined) native.adminPin = String(b.adminPin);
    if (b.policy !== undefined) native.policy = b.policy;
    if (b.design !== undefined) native.design = b.design;
    if (b.mdm !== undefined) native.mdm = b.mdm;
    saveGroundUpConfigs();
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.native_update_config', targetType: 'config', targetId: String(id), details: {}, ipAddress: req.ip
    });
    return res.json({ ok: true });
  }

  if (!hmdmConfigured()) {
    // Upsert into groundUpConfigs
    const newConfig: GroundUpConfig = {
      id,
      name: String(b.name || `Configuration ${id}`),
      deviceCount: 0,
      contentApp: 'ApexBrowser (Web Kiosk)',
      kioskMode: true,
      wifiSsid: String(b.wifiSsid || 'Raytreat'),
      wifiSecurity: String(b.wifiSecurity || 'WPA'),
      wifiPassword: b.wifiPassword ? String(b.wifiPassword) : undefined,
      startUrl: String(b.startUrl || 'https://apexmsp.app'),
      adminPin: String(b.adminPin || '2468'),
      mobileEnrollment: true,
      qrcodeKey: `custom-config-${id}-qr`,
      policy: b.policy,
      design: b.design,
      mdm: b.mdm
    };
    groundUpConfigs.push(newConfig);
    saveGroundUpConfigs();
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mdm.native_update_config', targetType: 'config', targetId: String(id), details: {}, ipAddress: req.ip
    });
    return res.json({ ok: true });
  }

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
  let mdm: any = undefined;
  if (b.mdm && typeof b.mdm === 'object') {
    const mb = b.mdm;
    const bool = (v: any) => (v !== undefined ? !!v : undefined);
    mdm = {
      kioskMode: bool(mb.kioskMode), kioskScreenOn: bool(mb.kioskScreenOn), kioskKeyguard: bool(mb.kioskKeyguard),
      autostartForeground: bool(mb.autostartForeground), kioskHome: bool(mb.kioskHome), kioskRecents: bool(mb.kioskRecents),
      kioskNotifications: bool(mb.kioskNotifications), kioskSystemInfo: bool(mb.kioskSystemInfo),
      kioskLockButtons: bool(mb.kioskLockButtons), kioskExit: bool(mb.kioskExit), blockStatusBar: bool(mb.blockStatusBar),
      orientation: ['none', 'portrait', 'landscape'].includes(mb.orientation) ? mb.orientation : undefined,
      runDefaultLauncher: bool(mb.runDefaultLauncher), autoUpdate: bool(mb.autoUpdate),
      disableScreenshots: bool(mb.disableScreenshots), encryptDevice: bool(mb.encryptDevice), lockSafeSettings: bool(mb.lockSafeSettings)
    };
  }
  const ok = await updateConfig(id, {
    wifiSsid: b.wifiSsid !== undefined ? String(b.wifiSsid) : undefined,
    wifiPassword: b.wifiPassword ? String(b.wifiPassword) : undefined,
    wifiSecurity: b.wifiSecurity !== undefined ? String(b.wifiSecurity) : undefined,
    startUrl: b.startUrl !== undefined ? String(b.startUrl) : undefined,
    adminPin: b.adminPin !== undefined ? String(b.adminPin) : undefined,
    policy, design, mdm
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
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    const assignedIds = cfg?.assignedAppIds || [1];
    const settings = cfg?.appSettings || {};
    const assigned = groundUpApps
      .filter((a) => assignedIds.includes(a.id))
      .map((a) => ({
        applicationId: a.id,
        pkg: a.pkg,
        name: a.name,
        version: a.version || null,
        system: a.system || false,
        showIcon: settings[a.id]?.showIcon ?? true,
        remove: settings[a.id]?.remove ?? false,
        url: a.url || null
      }));
    const available = groundUpApps
      .filter((a) => !assignedIds.includes(a.id))
      .map((a) => ({
        id: a.id,
        pkg: a.pkg,
        name: a.name,
        version: a.version || null,
        system: a.system || false,
        url: a.url || null
      }));
    return res.json({ assigned, available });
  }
  const [assigned, available] = await Promise.all([getConfigApps(id), getAvailableApps(id)]);
  res.json({ assigned, available });
});

// POST /api/v1/mdm/native/configurations/:id/apps — assign an app { applicationId }
router.post('/native/configurations/:id/apps', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const appId = parseInt(String((req.body || {}).applicationId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(appId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    if (cfg) {
      cfg.assignedAppIds = cfg.assignedAppIds || [1];
      if (!cfg.assignedAppIds.includes(appId)) {
        cfg.assignedAppIds.push(appId);
        saveGroundUpConfigs();
      }
    }
    store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_add', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
    return res.json({ ok: true });
  }
  const ok = await addConfigApp(id, appId);
  if (!ok) { res.status(502).json({ error: 'assign failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_add', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// PUT /api/v1/mdm/native/configurations/:id/apps/:appId — toggle showIcon / remove
router.put('/native/configurations/:id/apps/:appId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const appId = parseInt(String(req.params.appId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(appId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    if (cfg) {
      cfg.appSettings = cfg.appSettings || {};
      const b = req.body || {};
      cfg.appSettings[appId] = {
        showIcon: b.showIcon !== undefined ? !!b.showIcon : (cfg.appSettings[appId]?.showIcon ?? true),
        remove: b.remove !== undefined ? !!b.remove : (cfg.appSettings[appId]?.remove ?? false)
      };
      saveGroundUpConfigs();
    }
    return res.json({ ok: true });
  }
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
  if (!Number.isFinite(id) || !Number.isFinite(appId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    if (cfg && cfg.assignedAppIds) {
      cfg.assignedAppIds = cfg.assignedAppIds.filter((aid) => aid !== appId);
      if (cfg.appSettings) delete cfg.appSettings[appId];
      saveGroundUpConfigs();
    }
    store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_remove', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
    return res.json({ ok: true });
  }
  const ok = await removeConfigApp(id, appId);
  if (!ok) { res.status(502).json({ error: 'remove failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_app_remove', targetType: 'config', targetId: String(id), details: { appId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// ---- Per-configuration file push (native Files tab) ------------------------
// GET /api/v1/mdm/native/configurations/:id/files — assigned + available files
router.get('/native/configurations/:id/files', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    const assignedIds = cfg?.assignedFileIds || [1];
    const assigned = groundUpFiles
      .filter((f) => assignedIds.includes(f.id))
      .map((f) => ({
        fileId: f.id,
        name: f.name,
        devicePath: f.devicePath,
        remove: false,
        url: null
      }));
    const available = groundUpFiles
      .filter((f) => !assignedIds.includes(f.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        devicePath: f.devicePath
      }));
    return res.json({ assigned, available });
  }
  const [assigned, available] = await Promise.all([getConfigFiles(id), getAvailableFiles(id)]);
  res.json({ assigned, available });
});

// POST /api/v1/mdm/native/configurations/:id/files — assign a file { fileId, devicePath? }
router.post('/native/configurations/:id/files', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String((req.body || {}).fileId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(fileId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    if (cfg) {
      cfg.assignedFileIds = cfg.assignedFileIds || [1];
      if (!cfg.assignedFileIds.includes(fileId)) {
        cfg.assignedFileIds.push(fileId);
        saveGroundUpConfigs();
      }
    }
    store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_add', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
    return res.json({ ok: true });
  }
  const ok = await addConfigFile(id, fileId, (req.body || {}).devicePath !== undefined ? String(req.body.devicePath) : undefined);
  if (!ok) { res.status(502).json({ error: 'assign failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_add', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
  res.json({ ok: true });
});

// PUT /api/v1/mdm/native/configurations/:id/files/:fileId — device path / remove flag
router.put('/native/configurations/:id/files/:fileId', async (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const fileId = parseInt(String(req.params.fileId), 10);
  if (!Number.isFinite(id) || !Number.isFinite(fileId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    return res.json({ ok: true });
  }
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
  if (!Number.isFinite(id) || !Number.isFinite(fileId)) { res.status(400).json({ error: 'bad request' }); return; }
  if (!hmdmConfigured()) {
    const cfg = groundUpConfigs.find((c) => c.id === id);
    if (cfg && cfg.assignedFileIds) {
      cfg.assignedFileIds = cfg.assignedFileIds.filter((fid) => fid !== fileId);
      saveGroundUpConfigs();
    }
    store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_remove', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
    return res.json({ ok: true });
  }
  const ok = await removeConfigFile(id, fileId);
  if (!ok) { res.status(502).json({ error: 'remove failed' }); return; }
  store.recordAudit({ orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name, action: 'mdm.native_config_file_remove', targetType: 'config', targetId: String(id), details: { fileId }, ipAddress: req.ip });
  res.json({ ok: true });
});

const execFileAsync = promisify(execFile);

function getAdbBin(): string {
  const candidates = [
    '/usr/local/bin/adb',
    '/opt/homebrew/bin/adb',
    '/usr/bin/adb',
    'adb'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'adb';
}

// POST /api/v1/mdm/devices/:id/adb — execute ADB action or command on tablet
router.post('/devices/:id/adb', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const { action, command } = req.body || {};
  const adbBin = getAdbBin();

  try {
    const listRes = await execFileAsync(adbBin, ['devices']);
    const stdout = listRes.stdout || '';

    let targetArg: string[] = [];
    if (serial && stdout.includes(serial)) {
      targetArg = ['-s', serial];
    }

    if (action === 'allow_media') {
      const outputLines: string[] = [];
      const cmds = [
        ['shell', 'appops', 'set', 'net.christianbeier.droidvnc_ng', 'PROJECT_MEDIA', 'allow'],
        ['shell', 'appops', 'set', 'net.christianbeier.droidvnc_ng', 'SYSTEM_ALERT_WINDOW', 'allow'],
        ['shell', 'appops', 'set', 'app.apexmsp.agent', 'SYSTEM_ALERT_WINDOW', 'allow'],
        ['shell', 'appops', 'set', 'com.hmdm.launcher', 'SYSTEM_ALERT_WINDOW', 'allow'],
        ['shell', 'am', 'start-foreground-service', '-n', 'net.christianbeier.droidvnc_ng/.MainActivity']
      ];

      for (const cmdArgs of cmds) {
        try {
          const runRes = await execFileAsync(adbBin, [...targetArg, ...cmdArgs]);
          if (runRes.stdout) outputLines.push(runRes.stdout.trim());
        } catch (e: any) {
          outputLines.push(`(adb shell: ${e.message.split('\n')[0]})`);
        }
      }

      store.recordAudit({
        orgId: req.user!.orgId,
        userId: req.user!.id,
        actorName: req.user!.name,
        action: 'mdm.adb_allow_media',
        targetType: 'device',
        targetId: serial,
        details: { output: outputLines.join('\n') },
        ipAddress: req.ip
      });

      res.json({
        ok: true,
        output: outputLines.filter(Boolean).join('\n') || 'MediaProjection and Overlay permissions successfully granted to DroidVNC-NG and ApexAgent!'
      });
      return;
    }

    if (action === 'custom' && command) {
      // Split command safely or pass to shell
      const parts = String(command).trim().replace(/^adb\s+shell\s+/i, '').split(/\s+/);
      const runRes = await execFileAsync(adbBin, [...targetArg, 'shell', ...parts]);
      res.json({ ok: true, output: runRes.stdout || runRes.stderr || 'Command executed successfully.' });
      return;
    }

    res.json({ ok: true, output: stdout });
  } catch (err: any) {
    res.status(200).json({
      ok: false,
      error: err.message,
      note: 'Ensure tablet is connected with USB Debugging enabled, or execute allowmedia.bat from the tech workstation.'
    });
  }
});

// GET /api/v1/mdm/devices/:id/adb-status — check if device is seen by local ADB
router.get('/devices/:id/adb-status', async (req: AuthenticatedRequest, res) => {
  const serial = String(req.params.id);
  const adbBin = getAdbBin();
  try {
    const listRes = await execFileAsync(adbBin, ['devices']);
    const stdout = listRes.stdout || '';
    const isConnected = stdout.split('\n').some(line => {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 2 && parts[1] === 'device' && (parts[0] === serial || parts[0].includes('device'));
    });
    res.json({ ok: true, connected: isConnected, devicesOutput: stdout });
  } catch (err: any) {
    res.json({ ok: false, connected: false, error: err.message });
  }
});

export default router;
