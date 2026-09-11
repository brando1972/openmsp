import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import type { RustDeskSession } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/remote/config
router.get('/config', (req, res) => {
  res.json(store.rustDeskConfig);
});

// PATCH /api/v1/remote/config
router.patch('/config', (req: AuthenticatedRequest, res) => {
  const updates = req.body;
  store.rustDeskConfig = { ...store.rustDeskConfig, ...updates };

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.config_update',
    targetType: 'relay_config',
    targetId: 'rustdesk',
    details: updates,
    ipAddress: req.ip
  });

  res.json(store.rustDeskConfig);
});

// GET /api/v1/remote/health
router.get('/health', (req, res) => {
  res.json({
    online: store.rustDeskConfig.onlineState,
    relayServer: store.rustDeskConfig.relayServer,
    idServer: store.rustDeskConfig.idServer,
    activeSessions: store.rustDeskSessions.size,
    latencyMs: 14,
    status: 'operational'
  });
});

// GET /api/v1/remote/sessions
router.get('/sessions', (req, res) => {
  res.json(Array.from(store.rustDeskSessions.values()));
});

// POST /api/v1/remote/sessions/start
router.post('/sessions/start', (req: AuthenticatedRequest, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }

  const device = store.devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const sessionId = `sess-${uuidv4().substring(0, 8)}`;
  const session: RustDeskSession = {
    id: sessionId,
    deviceId: device.id,
    deviceName: device.name,
    rustDeskId: device.rustDeskId || '982341209',
    clientName: device.clientName,
    connectedTech: req.user!.name,
    startedAt: new Date().toISOString(),
    status: 'connected',
    sessionKey: `rd-sess-${uuidv4()}`
  };

  store.rustDeskSessions.set(sessionId, session);
  store.rustDeskConfig.activeSessionsCount = store.rustDeskSessions.size;

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'remote.session_start',
    targetType: 'device',
    targetId: device.id,
    details: { sessionId, rustDeskId: session.rustDeskId },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'session.started', session);

  res.status(201).json(session);
});

// POST /api/v1/remote/sessions/:id/end
router.post('/sessions/:id/end', (req: AuthenticatedRequest, res) => {
  const sessionId = req.params.id as string;
  const session = store.rustDeskSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  session.status = 'ended';
  store.rustDeskSessions.delete(sessionId);
  store.rustDeskConfig.activeSessionsCount = store.rustDeskSessions.size;

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
