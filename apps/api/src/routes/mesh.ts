import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { meshClient, type MeshNode } from '../mesh/meshClient.js';
import { repairAgent, type HealAgent } from '../mesh/heal.js';
import type { ManagedDevice } from '@openmsp/api-types';

const RMM_STALE_MS = 10 * 60 * 1000;

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
  const now = Date.now();
  const nodes = await Promise.all(meshClient.listNodes().map(async (n) => {
    const d = rmmDeviceForNode(n);
    const explicit = store.meshNodeClients.get(n.nodeid);
    const thumb = meshClient.getThumb(n.nodeid);
    // Pull hardware telemetry from MeshCentral (stored inventory — available even
    // without the RMM agent AND even when the device is currently offline).
    const telemetry = await meshClient.getTelemetry(n.nodeid);
    // Fused per-agent status so the console can show both channels and repair the
    // down one. RMM is "online" if it heartbeat recently; Mesh from the live conn.
    const rmmLast = d?.metrics?.lastSeen ? Date.parse(d.metrics.lastSeen) : 0;
    const rmmState = !d ? 'absent' : (rmmLast && now - rmmLast < RMM_STALE_MS ? 'online' : 'offline');
    return {
      nodeid: n.nodeid,
      name: n.name,
      rname: n.rname,
      host: n.host,
      online: n.online,
      deviceId: d?.id || null,
      // Identity: RMM device's client wins; else an explicit operator assignment; else unassigned.
      clientId: d?.clientId || explicit?.clientId || null,
      clientName: d?.clientName || explicit?.clientName || '',
      assigned: !!(d?.clientId || explicit?.clientId),
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
      agents: {
        rmm: { state: rmmState, lastSeen: d?.metrics?.lastSeen ?? null },
        mesh: { state: n.online ? 'online' : 'offline' }
      },
      thumbAt: thumb ? thumb.ts : null
    };
  }));
  res.json({ configured: true, connected: true, nodes });
});

// PATCH /api/v1/mesh/nodes/:nodeid/client — assign a mesh node to a client org
// (for nodes with no RMM agent to infer the client from). Body: { clientId } or
// { clientId: '' | 'none' } to clear the assignment.
router.patch('/nodes/:nodeid/client', (req: AuthenticatedRequest, res) => {
  const nodeid = String(req.params.nodeid);
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!clientId || clientId === 'none') {
    store.meshNodeClients.delete(nodeid);
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: 'mesh.unassign_client', targetType: 'device', targetId: nodeid, details: {}, ipAddress: req.ip
    });
    res.json({ ok: true, nodeid, clientId: null, clientName: '' });
    return;
  }
  const client = store.clients.get(clientId);
  if (!client) { res.status(404).json({ error: 'Client not found' }); return; }
  store.meshNodeClients.set(nodeid, { clientId, clientName: client.name });
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'mesh.assign_client', targetType: 'device', targetId: nodeid,
    details: { clientId, clientName: client.name }, ipAddress: req.ip
  });
  res.json({ ok: true, nodeid, clientId, clientName: client.name });
});

// POST /api/v1/mesh/nodes/:nodeid/repair — manually repair a sibling agent.
// Body: { agent: 'rmm' | 'mesh' } — 'rmm' restarts the RMM agent via MeshCentral;
// 'mesh' enqueues an RMM command to restart the Mesh agent.
router.post('/nodes/:nodeid/repair', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) { res.status(503).json({ error: 'Remote engine not configured' }); return; }
  const agent = req.body?.agent as HealAgent;
  if (agent !== 'rmm' && agent !== 'mesh') { res.status(400).json({ error: "agent must be 'rmm' or 'mesh'" }); return; }
  try { await meshClient.ensureReady(); } catch { res.status(502).json({ error: 'remote engine unreachable' }); return; }
  const nodeid = String(req.params.nodeid);
  const result = await repairAgent(nodeid, agent);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'agent.heal_manual', targetType: 'device', targetId: nodeid,
    details: { agent, ok: result.ok }, ipAddress: req.ip
  });
  res.status(result.ok ? 200 : 409).json(result);
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
  const protocol = typeof req.body?.protocol === 'number' ? req.body.protocol : 2;
  const node = meshClient.getNode(nodeid);
  const device = deviceId ? store.devices.get(deviceId) : undefined;
  const deviceName = device?.name || node?.name || node?.rname || nodeid;
  try {
    const session = await meshClient.openDesktopSession(nodeid, protocol);
    store.recordAudit({
      orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
      action: protocol === 2 ? 'remote.desktop_start' : (protocol === 6 ? 'remote.powershell_start' : 'remote.terminal_start'),
      targetType: 'device', targetId: deviceId || nodeid,
      details: { nodeid, transport: 'apexconnect-native', deviceName, protocol }, ipAddress: req.ip
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
