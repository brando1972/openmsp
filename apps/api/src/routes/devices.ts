import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import { meshClient } from '../mesh/meshClient.js';
import type { ManagedDevice, DeviceCommand, CreateDeviceCommandRequest } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

function enrichDeviceWithMesh(d: ManagedDevice): ManagedDevice {
  const node = meshClient.resolveNode([d.hostname, d.name].filter(Boolean) as string[]);
  if (!node) return d;

  const cachedTelem = meshClient.getCachedTelemetry(node.nodeid);
  const loggedInUser = d.loggedInUser || cachedTelem?.loggedInUser || (node.users && node.users.length > 0 ? node.users[0] : undefined);
  const domain = d.domain || cachedTelem?.domain || node.domain || (d.os === 'windows' ? 'WORKGROUP' : undefined);

  if (loggedInUser !== d.loggedInUser || domain !== d.domain) {
    return {
      ...d,
      loggedInUser: loggedInUser || d.loggedInUser,
      domain: domain || d.domain
    };
  }
  return d;
}

import { getMdmDevices } from '../db/mdmStore.js';

function getMdmManagedDevices(): ManagedDevice[] {
  const mdmList = getMdmDevices();
  const res: ManagedDevice[] = [];
  const primaryClient = store.clients.get('c-brandon-ray') || Array.from(store.clients.values())[0];

  for (const md of mdmList) {
    const assigned = store.mdmClients.get(md.number);
    const clientId = assigned?.clientId || primaryClient?.id || 'c-brandon-ray';
    const clientName = assigned?.clientName || primaryClient?.name || 'Brandon Ray';
    const isOnline = md.online;

    res.push({
      id: md.number,
      name: md.name || 'Raytreat Lenovo Kiosk',
      hostname: md.number,
      clientId,
      clientName,
      siteId: 'Primary',
      siteName: 'Primary',
      os: 'android',
      osVersion: 'Android 14 (Enterprise)',
      serialNumber: md.number,
      ipAddress: md.publicIp || '10.10.10.171',
      publicIp: md.publicIp || '',
      macAddress: '',
      health: isOnline ? 'healthy' : 'offline',
      metrics: {
        cpuUsage: 14,
        ramUsage: 42,
        diskUsage: 28,
        uptimeDays: 2.1,
        lastSeen: new Date(md.lastUpdate || Date.now()).toISOString()
      },
      rustDeskId: '',
      rustDeskOnline: false,
      mdmEnrolled: true,
      encryptionStatus: 'encrypted',
      patchCompliance: 100,
      pendingPatchesCount: 0,
      installedApps: [
        { id: 'kiosk', name: 'ApexMSP Kiosk Browser', version: '1.0.3', publisher: 'ApexMSP', installDate: '2026-09-18' },
        { id: 'vnc', name: 'droidVNC-NG', version: '2.4.0', publisher: 'Christian Beier', installDate: '2026-09-18' },
        { id: 'agent', name: 'ApexAgent Bridge', version: '1.0.3', publisher: 'ApexMSP', installDate: '2026-09-18' }
      ],
      services: [
        { name: 'app.apexmsp.kiosk', displayName: 'ApexMSP Kiosk', status: 'running', startupType: 'auto' },
        { name: 'app.apexmsp.agent.BridgeService', displayName: 'Apex Remote Control Bridge', status: 'running', startupType: 'auto' },
        { name: 'net.christianbeier.droidvnc_ng', displayName: 'droidVNC-NG RFB Service', status: 'running', startupType: 'auto' }
      ],
      eventLogs: [],
      tags: ['tablet', 'android', 'kiosk'],
      loggedInUser: 'Kiosk User',
      domain: 'Android Enterprise',
      createdAt: new Date(md.enrollTime || Date.now()).toISOString(),
      updatedAt: new Date(md.lastUpdate || Date.now()).toISOString()
    });
  }
  return res;
}

// GET /api/v1/devices
router.get('/', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  const desktopDevices = Array.from(store.devices.values()).map(enrichDeviceWithMesh);
  const mdmDevices = getMdmManagedDevices();
  const allDevices = [...desktopDevices, ...mdmDevices];

  if (clientId && clientId !== 'all') {
    const filtered = allDevices.filter((d) => d.clientId === clientId);
    res.json(filtered);
    return;
  }

  res.json(allDevices);
});

// GET /api/v1/devices/:id
router.get('/:id', (req, res) => {
  const id = req.params.id as string;
  const device = store.devices.get(id) || getMdmManagedDevices().find((d) => d.id === id);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(device.os === 'android' ? device : enrichDeviceWithMesh(device));
});

// PATCH /api/v1/devices/:id
router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const device = store.devices.get(req.params.id as string);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const { name, health, tags, encryptionStatus } = req.body;
  const oldHealth = device.health;

  if (name !== undefined) device.name = name;
  if (tags !== undefined && Array.isArray(tags)) device.tags = tags;
  if (encryptionStatus !== undefined) device.encryptionStatus = encryptionStatus;
  if (health !== undefined) {
    device.health = health;
    if (oldHealth !== health) {
      wsManager.broadcastToOrg(req.user!.orgId, 'device.health_changed', {
        deviceId: device.id,
        previousHealth: oldHealth,
        currentHealth: health,
        reason: 'Manual status update or threshold trigger'
      });
    }
  }

  device.updatedAt = new Date().toISOString();
  store.devices.set(device.id, device);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'device.update',
    targetType: 'device',
    targetId: device.id,
    details: req.body,
    ipAddress: req.ip
  });

  res.json(device);
});

// POST /api/v1/devices/:id/commands
router.post('/:id/commands', (req: AuthenticatedRequest, res) => {
  const device = store.devices.get(req.params.id as string);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const { commandType, payload } = req.body as CreateDeviceCommandRequest;
  if (!commandType) {
    res.status(400).json({ error: 'commandType is required' });
    return;
  }

  const commandId = `cmd-${uuidv4().substring(0, 8)}`;
  const command: DeviceCommand = {
    id: commandId,
    deviceId: device.id,
    orgId: req.user!.orgId,
    commandType,
    payload: payload || {},
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  store.deviceCommands.set(commandId, command);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: `command.${commandType}`,
    targetType: 'device',
    targetId: device.id,
    details: { commandId, payload },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'command.updated', {
    commandId,
    deviceId: device.id,
    commandType,
    status: 'pending'
  });

  res.status(202).json(command);
});

// GET /api/v1/devices/:id/commands
router.get('/:id/commands', (req, res) => {
  const commands = Array.from(store.deviceCommands.values()).filter((c) => c.deviceId === (req.params.id as string));
  res.json(commands);
});

// GET /api/v1/devices/:id/commands/:cmdId
router.get('/:id/commands/:cmdId', (req, res) => {
  const command = store.deviceCommands.get(req.params.cmdId as string);
  if (!command || command.deviceId !== req.params.id) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json(command);
});

// POST /api/v1/devices/:id/wipe (Dangerous Action)
router.post('/:id/wipe', (req: AuthenticatedRequest, res) => {
  const { confirm } = req.body;
  if (confirm !== true) {
    res.status(400).json({ error: 'Remote wipe requires explicit confirmation parameter' });
    return;
  }

  const device = store.devices.get(req.params.id as string);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const commandId = `cmd-${uuidv4().substring(0, 8)}`;
  const wipeCommand: DeviceCommand = {
    id: commandId,
    deviceId: device.id,
    orgId: req.user!.orgId,
    commandType: 'remote_wipe',
    payload: { initiatedBy: req.user!.email },
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  store.deviceCommands.set(commandId, wipeCommand);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'device.remote_wipe',
    targetType: 'device',
    targetId: device.id,
    details: { warning: 'CRITICAL REMOTE WIPE INITIATED' },
    ipAddress: req.ip
  });

  res.status(202).json({ success: true, message: 'Remote wipe job queued', commandId });
});

export default router;
