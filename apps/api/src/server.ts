import express from 'express';
import cors from 'cors';
import http from 'http';
import { wsManager } from './ws/manager.js';

import authRouter from './routes/auth.js';
import clientsRouter from './routes/clients.js';
import devicesRouter from './routes/devices.js';
import agentsRouter from './routes/agents.js';
import ticketsRouter from './routes/tickets.js';
import automationsRouter from './routes/automations.js';
import patchesRouter from './routes/patches.js';
import vaultRouter from './routes/vault.js';
import remoteRouter from './routes/remote.js';
import aiRouter from './routes/ai.js';
import settingsRouter from './routes/settings.js';
import auditRouter from './routes/audit.js';
import installersRouter from './routes/installers.js';
import mdmRouter from './routes/mdm.js';
import meshRouter from './routes/mesh.js';
import netRouter from './routes/net.js';
import dispatchRouter from './routes/dispatch.js';
import { meshClient } from './mesh/meshClient.js';
import { startWatchdog } from './mesh/heal.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
wsManager.init(server);

// Middleware
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '8mb' })); // network-scan payloads can be large

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OpenMSP Control Plane', timestamp: new Date().toISOString() });
});

// Mount /api/v1 Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/clients', clientsRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1/tickets', ticketsRouter);
app.use('/api/v1/automations', automationsRouter);
app.use('/api/v1/patches', patchesRouter);
app.use('/api/v1/vault', vaultRouter);
app.use('/api/v1/remote', remoteRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/org/settings', settingsRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/installers', installersRouter);
app.use('/api/v1/mdm', mdmRouter);
app.use('/api/v1/mesh', meshRouter);
app.use('/api/v1/net', netRouter);
app.use('/api/v1/dispatch', dispatchRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[+] OpenMSP Control Plane API listening on http://localhost:${PORT}`);
  console.log(`[+] WebSocket Server live on ws://localhost:${PORT}/ws/v1/org/:orgId`);
  // Warm up the native ApexConnect remote engine (best-effort; no-op if unconfigured).
  if (meshClient.configured()) {
    meshClient.ensureReady().then(
      () => {
        console.log('[mesh] ApexConnect control channel ready');
        meshClient.startThumbnailScheduler(300000); // refresh desktop thumbnails every 5 min
        startWatchdog(120000); // cross-agent watchdog: heal a down agent via its sibling
        console.log(`[heal] cross-agent watchdog ${process.env.HEAL_AUTO === '0' ? 'DISABLED (HEAL_AUTO=0)' : 'active'}`);
      },
      (e) => console.log('[mesh] control channel not ready:', e instanceof Error ? e.message : e)
    );
  } else {
    console.log('[mesh] ApexConnect remote engine not configured (set MESH_USER/MESH_PASS)');
  }
});

export { app, server };
