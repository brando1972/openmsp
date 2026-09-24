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
import stagedAppsRouter from './routes/stagedApps.js';
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

import fs from 'fs';
import path from 'path';

import { getTargetTabletUrl, setTargetTabletUrl, recordTabletHeartbeat, getMdmDevice, updateMdmDevice } from './db/mdmStore.js';

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OpenMSP Control Plane', timestamp: new Date().toISOString() });
});

// POST /api/v1/mdm/devices/:id/push-url — push target URL to tablet
app.post(['/api/v1/mdm/devices/:id/push-url', '/api/v1/mdm/push-url'], (req, res) => {
  const url = req.body?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' });
  }
  const fullUrl = url.startsWith('http') ? url : ('https://' + url);
  setTargetTabletUrl(fullUrl);
  const deviceId = String(req.params?.id || req.body?.deviceId || 'apex-lenovo-01');
  updateMdmDevice(deviceId, { targetUrl: fullUrl });
  console.log(`[ApexMDM] Target URL set to: ${fullUrl}`);
  res.json({ ok: true, targetUrl: fullUrl });
});

// POST /api/v1/mdm/heartbeat — unauthenticated check-in from enrolled tablet
app.post('/api/v1/mdm/heartbeat', (req, res) => {
  const result = recordTabletHeartbeat(req.body, req.ip);
  res.json(result);
});

// GET /api/v1/mdm/devices/status — live tablet telemetry for console
app.get('/api/v1/mdm/devices/status', (_req, res) => {
  const dev = getMdmDevice('apex-lenovo-01');
  res.json({
    ok: true,
    lastHeartbeat: dev ? {
      deviceId: dev.number,
      name: dev.name,
      model: dev.model,
      battery: dev.battery,
      screenWidth: dev.screenWidth,
      screenHeight: dev.screenHeight,
      online: dev.online,
      receivedAt: dev.lastUpdate
    } : null,
    targetTabletUrl: getTargetTabletUrl()
  });
});

function findApkFile(name: string, fallbackPaths: string[]): string | null {
  const candidates = [
    `/builds/${name}`,
    `/app/apps/api/builds/${name}`,
    `/app/builds/${name}`,
    path.join(process.cwd(), 'builds', name),
    path.join(process.cwd(), 'apps', 'api', 'builds', name),
    ...fallbackPaths
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// Public Android Enterprise DPC APK download endpoint
app.get(['/api/v1/apexmdm/dpc/latest.apk', '/dpc/latest.apk'], (_req, res) => {
  const apkPath = findApkFile('ApexMDM-DPC.apk', [
    '/Users/brandonray/dev/ApexMSP-Kiosk/app/build/outputs/apk/release/app-release.apk'
  ]);
  if (apkPath) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="ApexMDM-DPC.apk"');
    return res.sendFile(apkPath);
  }
  return res.status(404).json({ error: 'DPC APK not found on server' });
});

// Public Remote Control Agent APK download endpoints
app.get(['/api/v1/mdm/apks/droidvnc-ng.apk', '/apks/droidvnc-ng.apk'], (_req, res) => {
  const apkPath = findApkFile('droidvnc-ng.apk', [
    '/Users/brandonray/Downloads/droidvnc-ng.apk'
  ]);
  if (apkPath) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="droidvnc-ng.apk"');
    return res.sendFile(apkPath);
  }
  return res.status(404).json({ error: 'droidvnc-ng APK not found' });
});

app.get(['/api/v1/mdm/apks/apex-agent.apk', '/apks/apex-agent.apk', '/agent.apk'], (_req, res) => {
  const apkPath = findApkFile('ApexAgent-1.0.3.apk', [
    '/Users/brandonray/dev/ApexMSP-Kiosk/app/src/main/assets/ApexAgent-1.0.3.apk',
    '/Users/brandonray/Claude/apex-vnc-relay/ApexAgent-1.0.3.apk'
  ]);
  if (apkPath) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="ApexAgent-1.0.3.apk"');
    return res.sendFile(apkPath);
  }
  return res.status(404).json({ error: 'ApexAgent APK not found' });
});

// GET / — Kiosk Tablet Interface with Chromium Web Browser launcher
app.get('/', (req, res) => {
  const activeTarget = getTargetTabletUrl();
  if (activeTarget && req.query.kiosk !== 'menu' && !activeTarget.includes('facebook.com')) {
    return res.redirect(activeTarget);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ApexMDM Kiosk</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #050811; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    .glow { box-shadow: 0 0 80px -10px rgba(217, 70, 239, 0.4); }
  </style>
</head>
<body class="h-screen w-screen flex flex-col items-center justify-center p-6 select-none bg-radial from-slate-900 to-[#050811]">
  <div class="max-w-md w-full flex flex-col items-center text-center">
    
    <!-- Header Card -->
    <div class="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl glow backdrop-blur flex flex-col items-center">
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-xl shadow-fuchsia-950/60 mb-3 animate-pulse">
        ▲
      </div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider mb-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        Device Owner Active
      </div>
      <h1 class="text-2xl font-black text-white tracking-tight mb-1">ApexMDM Kiosk</h1>
      <p class="text-xs text-slate-400 mb-4 leading-relaxed">
        Lenovo Tablet Enrolled via Android Enterprise Zero-Touch.
      </p>

      <div class="w-full bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 text-left font-mono text-[11px] text-slate-300 space-y-1.5">
        <div class="flex justify-between text-slate-400 border-b border-slate-800 pb-1">
          <span>STATUS</span>
          <span class="text-emerald-400 font-bold">MANAGED • ONLINE</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Package:</span>
          <span class="text-white font-semibold">app.apexmsp.kiosk</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Receiver:</span>
          <span class="text-fuchsia-400 font-semibold">ApexAdminReceiver</span>
        </div>
        <div class="flex justify-between border-t border-slate-800 pt-1">
          <span class="text-slate-400">Remote Control:</span>
          <a href="https://vnc.apexmsp.app" target="_blank" class="text-emerald-400 hover:underline">vnc.apexmsp.app</a>
        </div>
      </div>
    </div>

    <!-- Interactive Web Browser Dock -->
    <div class="mt-4 w-full bg-slate-900/95 border border-fuchsia-500/40 rounded-3xl p-4 shadow-2xl backdrop-blur">
      <div class="flex items-center justify-between mb-2.5">
        <span class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          Kiosk Browser
        </span>
        <span class="text-[10px] font-mono text-fuchsia-400">Chromium Embedded</span>
      </div>

      <!-- Quick Preset Launch Tiles -->
      <div class="grid grid-cols-3 gap-2 mb-3">
        <button onclick="launchUrl('https://google.com')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition border border-slate-700">
          <span class="text-base">🌐</span>
          <span>Google</span>
        </button>
        <button onclick="launchUrl('https://raytreat.com')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition border border-slate-700">
          <span class="text-base">🏥</span>
          <span>Raytreat</span>
        </button>
        <button onclick="launchUrl('https://apexmsp.app')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition border border-slate-700">
          <span class="text-base">⚡</span>
          <span>ApexMSP</span>
        </button>
      </div>

      <!-- Custom URL Bar -->
      <form onsubmit="handleManualLaunch(event)" class="flex gap-2">
        <input
          id="customUrlInput"
          type="text"
          placeholder="https://your-web-app.com"
          class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-fuchsia-500 transition font-mono"
        />
        <button
          type="submit"
          class="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer"
        >
          Open
        </button>
      </form>
      <div class="mt-2 text-[10px] text-slate-500 text-center">
        Tip: Tap top-left corner 7x (PIN: 2468) for Admin menu
      </div>
    </div>

  </div>

  <script>
    function launchUrl(url) {
      if (!url) return;
      window.location.href = url.startsWith('http') ? url : ('https://' + url);
    }

    function handleManualLaunch(e) {
      e.preventDefault();
      const val = document.getElementById('customUrlInput').value.trim();
      if (val) launchUrl(val);
    }

    // Live telemetry heartbeat from tablet to ApexMDM
    async function sendHeartbeat() {
      let batteryLevel = null;
      try {
        if ('getBattery' in navigator) {
          const b = await navigator.getBattery();
          batteryLevel = Math.round(b.level * 100);
        }
      } catch (_) {}

      try {
        const res = await fetch('/api/v1/mdm/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: 'apex-lenovo-01',
            name: 'Raytreat Lenovo Kiosk',
            model: 'Lenovo Tablet (Android Enterprise)',
            battery: batteryLevel,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            online: true
          })
        });
        const data = await res.json();
        if (data && data.targetUrl && typeof data.targetUrl === 'string' && data.targetUrl.startsWith('http')) {
          if (window.location.href !== data.targetUrl) {
            window.location.href = data.targetUrl;
          }
        }
      } catch (_) {}
    }
    sendHeartbeat();
    setInterval(sendHeartbeat, 5000);
  </script>
</body>
</html>`);
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
app.use('/api/v1/staged-apps', stagedAppsRouter);

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
