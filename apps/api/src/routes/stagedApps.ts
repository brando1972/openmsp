import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import { meshClient } from '../mesh/meshClient.js';
import type { StagedApp, DeviceCommand, DeviceStagedAppStatus } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/staged-apps — list all staged applications
router.get('/', (_req, res) => {
  res.json(Array.from(store.stagedApps.values()));
});

// POST /api/v1/staged-apps — create a new staged app
router.post('/', (req: AuthenticatedRequest, res) => {
  const {
    name,
    description,
    version,
    category,
    os,
    autoDeploy,
    detection,
    installScript,
    uninstallScript
  } = req.body;

  if (!name || !installScript) {
    res.status(400).json({ error: 'name and installScript are required' });
    return;
  }

  const id = `staged-${uuidv4().substring(0, 8)}`;
  const stagedApp: StagedApp = {
    id,
    name,
    description: description || '',
    version: version || '1.0.0',
    category: category || 'utility',
    os: os || 'all',
    enabled: true,
    autoDeploy: autoDeploy ?? true,
    detection: detection || { type: 'app_name', target: name },
    installScript: installScript || {},
    uninstallScript: uninstallScript || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.stagedApps.set(id, stagedApp);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'staged_app.create',
    targetType: 'staged_app',
    targetId: id,
    details: { name: stagedApp.name, os: stagedApp.os },
    ipAddress: req.ip
  });

  res.status(201).json(stagedApp);
});

// PATCH /api/v1/staged-apps/:id — update an existing staged app
router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const app = store.stagedApps.get(id);
  if (!app) {
    res.status(404).json({ error: 'Staged application not found' });
    return;
  }

  const {
    name,
    description,
    version,
    category,
    os,
    enabled,
    autoDeploy,
    detection,
    installScript,
    uninstallScript
  } = req.body;

  if (name !== undefined) app.name = name;
  if (description !== undefined) app.description = description;
  if (version !== undefined) app.version = version;
  if (category !== undefined) app.category = category;
  if (os !== undefined) app.os = os;
  if (enabled !== undefined) app.enabled = Boolean(enabled);
  if (autoDeploy !== undefined) app.autoDeploy = Boolean(autoDeploy);
  if (detection !== undefined) app.detection = detection;
  if (installScript !== undefined) app.installScript = installScript;
  if (uninstallScript !== undefined) app.uninstallScript = uninstallScript;
  app.updatedAt = new Date().toISOString();

  store.stagedApps.set(id, app);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'staged_app.update',
    targetType: 'staged_app',
    targetId: id,
    details: { name: app.name, enabled: app.enabled, autoDeploy: app.autoDeploy },
    ipAddress: req.ip
  });

  res.json(app);
});

// DELETE /api/v1/staged-apps/:id — delete a staged app
router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const app = store.stagedApps.get(id);
  if (!app) {
    res.status(404).json({ error: 'Staged application not found' });
    return;
  }

  store.stagedApps.delete(id);

  // Clean up deployment tracking records for this app
  for (const [key, dep] of store.deviceStagedDeployments.entries()) {
    if (dep.appId === id) {
      store.deviceStagedDeployments.delete(key);
    }
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'staged_app.delete',
    targetType: 'staged_app',
    targetId: id,
    details: { name: app.name },
    ipAddress: req.ip
  });

  res.json({ ok: true, deleted: id });
});

// GET /api/v1/staged-apps/devices/:deviceId — get staged app statuses for a single device
router.get('/devices/:deviceId', (req, res) => {
  const deviceId = String(req.params.deviceId);
  const device = store.devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const deviceOs = (device.os || '').toLowerCase();
  const statuses: DeviceStagedAppStatus[] = [];

  for (const app of store.stagedApps.values()) {
    if (app.os !== 'all' && app.os !== deviceOs) continue;

    const deployKey = `${device.id}:${app.id}`;
    let dep = store.deviceStagedDeployments.get(deployKey);

    // Live verification check
    let isPresent = false;
    if (app.detection.type === 'service') {
      const target = app.detection.target.toLowerCase();
      isPresent = (device.services || []).some(
        s => s.name.toLowerCase() === target || s.displayName.toLowerCase() === target
      );
      if (!isPresent && app.id === 'staged-apexconnect-remote' && meshClient.configured()) {
        const meshNode = meshClient.resolveNode([device.hostname, device.name].filter(Boolean) as string[]);
        if (meshNode) isPresent = true;
      }
    } else if (app.detection.type === 'app_name') {
      const target = app.detection.target.toLowerCase();
      isPresent = (device.installedApps || []).some(
        a => a.name.toLowerCase().includes(target)
      );
    }

    if (isPresent) {
      dep = {
        appId: app.id,
        appName: app.name,
        category: app.category,
        status: 'installed',
        lastChecked: new Date().toISOString(),
        lastInstalled: dep?.lastInstalled || new Date().toISOString()
      };
      store.deviceStagedDeployments.set(deployKey, dep);
    } else if (!dep) {
      dep = {
        appId: app.id,
        appName: app.name,
        category: app.category,
        status: 'not_installed',
        lastChecked: new Date().toISOString()
      };
    }

    statuses.push(dep);
  }

  res.json(statuses);
});

// POST /api/v1/staged-apps/:id/deploy/:deviceId — manually trigger deployment to a device
router.post('/:id/deploy/:deviceId', (req: AuthenticatedRequest, res) => {
  const appId = String(req.params.id);
  const deviceId = String(req.params.deviceId);

  const app = store.stagedApps.get(appId);
  if (!app) {
    res.status(404).json({ error: 'Staged application not found' });
    return;
  }

  const device = store.devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const deviceOs = (device.os || '').toLowerCase();
  const script = deviceOs === 'windows'
    ? app.installScript.windows
    : (deviceOs === 'macos' ? app.installScript.macos : app.installScript.linux);

  if (!script) {
    res.status(400).json({ error: `No install script configured for OS: ${device.os}` });
    return;
  }

  const cmdId = `cmd-stage-${uuidv4().substring(0, 8)}`;
  const stageCmd: DeviceCommand = {
    id: cmdId,
    deviceId: device.id,
    orgId: req.user!.orgId,
    commandType: 'run_script',
    payload: {
      purpose: 'deploy-staged-app',
      stagedAppId: app.id,
      stagedAppName: app.name,
      script
    },
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  store.deviceCommands.set(stageCmd.id, stageCmd);

  const deployKey = `${device.id}:${app.id}`;
  const dep: DeviceStagedAppStatus = {
    appId: app.id,
    appName: app.name,
    category: app.category,
    status: 'queued',
    lastChecked: new Date().toISOString(),
    commandId: cmdId
  };
  store.deviceStagedDeployments.set(deployKey, dep);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'staged_app.deploy_manual',
    targetType: 'device',
    targetId: device.id,
    details: { appId: app.id, appName: app.name, deviceName: device.name },
    ipAddress: req.ip
  });

  res.status(202).json({ ok: true, commandId: cmdId, status: 'queued' });
});

// POST /api/v1/staged-apps/:id/deploy-fleet — deploy to all matching devices missing the app
router.post('/:id/deploy-fleet', (req: AuthenticatedRequest, res) => {
  const appId = String(req.params.id);
  const app = store.stagedApps.get(appId);
  if (!app) {
    res.status(404).json({ error: 'Staged application not found' });
    return;
  }

  const queuedDevices: string[] = [];

  for (const device of store.devices.values()) {
    const deviceOs = (device.os || '').toLowerCase();
    if (app.os !== 'all' && app.os !== deviceOs) continue;

    const script = deviceOs === 'windows'
      ? app.installScript.windows
      : (deviceOs === 'macos' ? app.installScript.macos : app.installScript.linux);
    if (!script) continue;

    const cmdId = `cmd-stage-${uuidv4().substring(0, 8)}`;
    const stageCmd: DeviceCommand = {
      id: cmdId,
      deviceId: device.id,
      orgId: req.user!.orgId,
      commandType: 'run_script',
      payload: {
        purpose: 'deploy-staged-app',
        stagedAppId: app.id,
        stagedAppName: app.name,
        script
      },
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    store.deviceCommands.set(stageCmd.id, stageCmd);

    const deployKey = `${device.id}:${app.id}`;
    store.deviceStagedDeployments.set(deployKey, {
      appId: app.id,
      appName: app.name,
      category: app.category,
      status: 'queued',
      lastChecked: new Date().toISOString(),
      commandId: cmdId
    });

    queuedDevices.push(device.name || device.id);
  }

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'staged_app.deploy_fleet',
    targetType: 'staged_app',
    targetId: app.id,
    details: { appName: app.name, targetCount: queuedDevices.length },
    ipAddress: req.ip
  });

  res.json({ ok: true, queuedCount: queuedDevices.length, targets: queuedDevices });
});

// GET /api/v1/staged-apps/fleet-status — aggregate deployment stats across all devices
router.get('/fleet-status', (_req, res) => {
  const allDevices = Array.from(store.devices.values());
  const stats = Array.from(store.stagedApps.values()).map(app => {
    const matchingDevices = allDevices.filter(d => app.os === 'all' || d.os.toLowerCase() === app.os);
    let installed = 0;
    let queued = 0;
    let installing = 0;
    let failed = 0;
    let notInstalled = 0;

    for (const d of matchingDevices) {
      const dep = store.deviceStagedDeployments.get(`${d.id}:${app.id}`);
      if (!dep || dep.status === 'not_installed') {
        notInstalled++;
      } else if (dep.status === 'installed') {
        installed++;
      } else if (dep.status === 'queued') {
        queued++;
      } else if (dep.status === 'installing') {
        installing++;
      } else if (dep.status === 'failed') {
        failed++;
      }
    }

    return {
      appId: app.id,
      name: app.name,
      category: app.category,
      os: app.os,
      enabled: app.enabled,
      autoDeploy: app.autoDeploy,
      totalEligible: matchingDevices.length,
      installed,
      queued,
      installing,
      failed,
      notInstalled
    };
  });

  res.json(stats);
});

export default router;
