import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import { meshClient } from '../mesh/meshClient.js';

/**
 * Native ApexConnect remote-desktop control plane.
 * ---------------------------------------------------------------------------
 * The browser renders the remote desktop itself (raw meshrelay WebSocket +
 * KVM protocol) — no MeshCentral UI. This route hands the browser a
 * short-lived relay auth cookie and the tunnel id for exactly one node, and
 * asks that node's agent to open its relay side. MeshCentral credentials stay
 * server-side in meshClient.
 *
 * Device -> node mapping: RMM devices and MeshCentral nodes are separate
 * agents, so we correlate by hostname/name. An explicit override can be sent
 * as { nodeid } (used by the mesh-node picker) or seeded in store.meshNodes.
 */

const router = Router();
router.use(authenticate);

// GET /api/v1/mesh/health — is the native remote engine configured & connected?
router.get('/health', (_req: AuthenticatedRequest, res) => {
  res.json(meshClient.status());
});

// GET /api/v1/mesh/nodes — MeshCentral nodes known to the control channel
router.get('/nodes', async (_req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) {
    res.json({ configured: false, connected: false, nodes: [] });
    return;
  }
  try {
    await meshClient.ensureReady();
  } catch (err) {
    res.json({
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : 'not ready',
      nodes: []
    });
    return;
  }
  res.json({ configured: true, connected: true, nodes: meshClient.listNodes() });
});

// POST /api/v1/mesh/session — start a native remote-desktop session for a device
// body: { deviceId?: string, nodeid?: string }
router.post('/session', async (req: AuthenticatedRequest, res) => {
  if (!meshClient.configured()) {
    res.status(503).json({ error: 'ApexConnect remote engine not configured' });
    return;
  }

  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
  let nodeid = typeof req.body?.nodeid === 'string' ? req.body.nodeid : '';

  try {
    await meshClient.ensureReady();
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'remote engine unreachable' });
    return;
  }

  // Resolve the target MeshCentral node.
  const device = deviceId ? store.devices.get(deviceId) : undefined;
  if (!nodeid) {
    const explicit = deviceId ? store.meshNodes.get(deviceId) : undefined;
    if (explicit) nodeid = explicit;
  }
  if (!nodeid && device) {
    const candidates = [device.hostname, device.name].filter(Boolean) as string[];
    const node = meshClient.resolveNode(candidates);
    if (node) {
      nodeid = node.nodeid;
      // cache the correlation so future connects are instant
      if (deviceId) store.meshNodes.set(deviceId, nodeid);
    }
  }

  if (!nodeid) {
    res.status(404).json({
      error: device
        ? `No ApexConnect agent found for ${device.name}. Install/enroll the ApexConnect agent on this device.`
        : 'No target node — provide a deviceId or nodeid.'
    });
    return;
  }

  const node = meshClient.getNode(nodeid);
  const deviceName = device?.name || node?.name || node?.rname || nodeid;

  try {
    const session = await meshClient.openDesktopSession(nodeid, 2);
    store.recordAudit({
      orgId: req.user!.orgId,
      userId: req.user!.id,
      actorName: req.user!.name,
      action: 'remote.desktop_start',
      targetType: 'device',
      targetId: deviceId || nodeid,
      details: { nodeid, transport: 'apexconnect-native', deviceName },
      ipAddress: req.ip
    });
    res.json({
      ...session,
      deviceName,
      online: node ? node.online : true
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'failed to open remote session' });
  }
});

export default router;
