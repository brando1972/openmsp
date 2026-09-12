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

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
wsManager.init(server);

// Middleware
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

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

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[+] OpenMSP Control Plane API listening on http://localhost:${PORT}`);
  console.log(`[+] WebSocket Server live on ws://localhost:${PORT}/ws/v1/org/:orgId`);
});

export { app, server };
