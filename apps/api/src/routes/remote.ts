import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import type { RemoteSession } from '@openmsp/api-types';
import { buildDesktopEmbedUrl, isConfigured, ping, listNodes } from '../integrations/meshcentral.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/remote/config — MeshCentral connection config (provider-neutral)
// Also includes backward-compatible RustDeskServerConfig fields for legacy console clients
router.get('/config', (_req, res) => {
  res.json({
    ...store.remoteConfig,
    // Backward-compatible fields for legacy RustDesk console clients
    idServer: store.remoteConfig.serverUrl,
    relayServer: store.remoteConfig.serverUrl,
    apiServer: store.remoteConfig.serverUrl,
    key: '',
    customPort: 0,
    onlineState: store.remoteConfig.online
  });
});

// PATCH /api/v1/remote/config
router.patch('/config', (req: AuthenticatedRequest, res) => {
  store.remoteConfig = { ...store.remoteConfig, ...req.body };
  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.config_update',
    targetType: 'remote_config',
    targetId: 'meshcentral',
    details: req.body,
    ipAddress: req.ip
  });
  res.json(store.remoteConfig);
});

// GET /api/v1/remote/health — is MeshCentral reachable?
router.get('/health', async (_req, res) => {
  const online = await ping();
  store.remoteConfig.online = online;
  store.remoteConfig.activeSessionsCount = store.remoteSessions.size;
  res.json({
    provider: store.remoteConfig.provider,
    online,
    configured: isConfigured(),
    serverUrl: store.remoteConfig.serverUrl,
    deviceGroup: store.remoteConfig.deviceGroup,
    activeSessions: store.remoteSessions.size,
    status: online ? 'operational' : isConfigured() ? 'unreachable' : 'not_configured',
    latencyMs: 14,
    // Backward-compatible fields for legacy RustDesk console clients
    relayServer: store.remoteConfig.serverUrl,
    idServer: store.remoteConfig.serverUrl,
    onlineState: online
  });
});

// GET /api/v1/remote/devices — devices known to MeshCentral (best-effort)
router.get('/devices', async (_req, res) => {
  const nodes = await listNodes();
  res.json({ configured: isConfigured(), nodes });
});

// GET /api/v1/remote/sessions
router.get('/sessions', (_req, res) => {
  res.json(Array.from(store.remoteSessions.values()));
});

// POST /api/v1/remote/sessions/start — open a remote-desktop session for a device
router.post('/sessions/start', (req: AuthenticatedRequest, res) => {
  const { deviceId, meshNodeId } = req.body as { deviceId?: string; meshNodeId?: string };
  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }
  const device = store.devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const nodeId = meshNodeId || device.meshNodeId || '';
  const embedUrl = buildDesktopEmbedUrl(nodeId);
  if (!embedUrl) {
    res.status(409).json({
      error: 'Remote support not ready: MeshCentral not configured or device has no meshNodeId',
      configured: isConfigured()
    });
    return;
  }

  const sessionId = `sess-${uuidv4().substring(0, 8)}`;
  const session: RemoteSession = {
    id: sessionId,
    deviceId: device.id,
    deviceName: device.name,
    meshNodeId: nodeId,
    clientName: device.clientName,
    connectedTech: req.user!.name,
    startedAt: new Date().toISOString(),
    status: 'connected',
    embedUrl
  };
  store.remoteSessions.set(sessionId, session);
  store.remoteConfig.activeSessionsCount = store.remoteSessions.size;

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.session_start',
    targetType: 'device',
    targetId: device.id,
    details: { sessionId, meshNodeId: nodeId },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'session.started', session);
  res.status(201).json(session);
});

// POST /api/v1/remote/sessions/:id/end
router.post('/sessions/:id/end', (req: AuthenticatedRequest, res) => {
  const sessionId = req.params.id as string;
  const session = store.remoteSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  session.status = 'ended';
  store.remoteSessions.delete(sessionId);
  store.remoteConfig.activeSessionsCount = store.remoteSessions.size;

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.session_end',
    targetType: 'device',
    targetId: session.deviceId,
    details: { sessionId: session.id },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'session.ended', { sessionId: session.id });
  res.json({ success: true, session });
});

export default router;
