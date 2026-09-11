import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import type { ManagedDevice, DeviceCommand, CreateDeviceCommandRequest } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/devices
router.get('/', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  const allDevices = Array.from(store.devices.values());

  if (clientId && clientId !== 'all') {
    const filtered = allDevices.filter((d) => d.clientId === clientId);
    res.json(filtered);
    return;
  }

  res.json(allDevices);
});

// GET /api/v1/devices/:id
router.get('/:id', (req, res) => {
  const device = store.devices.get(req.params.id as string);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  res.json(device);
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
