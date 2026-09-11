import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { wsManager } from '../ws/manager.js';
import type {
  AgentEnrollRequest,
  AgentEnrollResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  ManagedDevice,
  DeviceCommand
} from '@openmsp/api-types';

const router = Router();

// POST /api/v1/agents/enroll
router.post('/enroll', (req, res) => {
  const { token, hostname, os, osVersion, serialNumber, macAddress, ipAddress } = req.body as AgentEnrollRequest;

  if (!token) {
    res.status(400).json({ error: 'Enrollment token is required' });
    return;
  }

  const enrollmentToken = store.enrollmentTokens.get(token);
  if (!enrollmentToken) {
    res.status(401).json({ error: 'Invalid enrollment token' });
    return;
  }

  if (new Date(enrollmentToken.expiresAt) < new Date()) {
    res.status(401).json({ error: 'Enrollment token expired' });
    return;
  }

  const client = store.clients.get(enrollmentToken.clientId);
  const clientName = client ? client.name : 'Unassigned Client';

  const deviceId = `dev-${os.substring(0, 3)}-${uuidv4().substring(0, 6)}`;
  const deviceSecret = `sec-${uuidv4()}`;

  const newDevice: ManagedDevice = {
    id: deviceId,
    name: hostname || `${os.toUpperCase()}-ENDPOINT`,
    hostname: hostname || 'unknown',
    clientId: enrollmentToken.clientId,
    clientName,
    siteId: enrollmentToken.siteId,
    siteName: enrollmentToken.siteId || 'Default Site',
    os: os || 'windows',
    osVersion: osVersion || '',
    serialNumber: serialNumber || '',
    ipAddress: ipAddress || req.ip || '',
    publicIp: req.ip || '',
    macAddress: macAddress || '',
    health: 'healthy',
    metrics: {
      cpuUsage: 5,
      ramUsage: 25,
      diskUsage: 30,
      uptimeDays: 0.1,
      lastSeen: new Date().toISOString()
    },
    rustDeskId: '',
    rustDeskOnline: false,
    mdmEnrolled: true,
    encryptionStatus: 'pending',
    patchCompliance: 100,
    pendingPatchesCount: 0,
    installedApps: [],
    services: [],
    eventLogs: [],
    tags: ['new-enrollment'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save device with deviceSecret internally
  (newDevice as any).deviceSecret = deviceSecret;
  store.devices.set(deviceId, newDevice);

  // Update client total devices count
  if (client) {
    client.totalDevices += 1;
    store.clients.set(client.id, client);
  }

  store.recordAudit({
    orgId: enrollmentToken.orgId,
    actorName: 'Device Agent',
    action: 'agent.enroll',
    targetType: 'device',
    targetId: deviceId,
    details: { hostname, os, ipAddress },
    ipAddress: req.ip
  });

  const response: AgentEnrollResponse = {
    deviceId,
    orgId: enrollmentToken.orgId,
    clientId: enrollmentToken.clientId,
    siteId: enrollmentToken.siteId,
    deviceSecret,
    heartbeatIntervalSeconds: 30,
    rustDeskConfig: store.rustDeskConfig
  };

  res.status(201).json(response);
});

// POST /api/v1/agents/heartbeat
router.post('/heartbeat', (req, res) => {
  const { deviceId, deviceSecret, metrics, network, installedApps, services, eventLogs, rustDeskId } =
    req.body as AgentHeartbeatRequest;

  if (!deviceId || !deviceSecret) {
    res.status(401).json({ error: 'Device ID and secret are required' });
    return;
  }

  const device = store.devices.get(deviceId);
  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  if ((device as any).deviceSecret && (device as any).deviceSecret !== deviceSecret) {
    res.status(401).json({ error: 'Invalid device secret' });
    return;
  }

  const previousHealth = device.health;
  device.metrics = {
    ...metrics,
    lastSeen: new Date().toISOString()
  };

  if (network) {
    if (network.ipAddress) device.ipAddress = network.ipAddress;
    if (network.macAddress) device.macAddress = network.macAddress;
    if (network.publicIp) device.publicIp = network.publicIp;
  }

  if (installedApps) device.installedApps = installedApps;
  if (services) device.services = services;
  if (eventLogs) device.eventLogs = eventLogs;
  if (rustDeskId) {
    device.rustDeskId = rustDeskId;
    device.rustDeskOnline = true;
  }

  // Calculate dynamic health
  if (metrics.cpuUsage > 90 || metrics.ramUsage > 95 || metrics.diskUsage > 95) {
    device.health = 'critical';
  } else if (metrics.cpuUsage > 75 || metrics.ramUsage > 85 || metrics.diskUsage > 85) {
    device.health = 'warning';
  } else {
    device.health = 'healthy';
  }

  device.updatedAt = new Date().toISOString();
  store.devices.set(device.id, device);

  // Broadcast heartbeat over WebSocket
  const org = Array.from(store.orgs.values())[0];
  const orgId = org ? org.id : '00000000-0000-0000-0000-000000000001';

  wsManager.broadcastToOrg(orgId, 'device.heartbeat', {
    deviceId: device.id,
    clientId: device.clientId,
    health: device.health,
    metrics: device.metrics
  });

  if (previousHealth !== device.health) {
    wsManager.broadcastToOrg(orgId, 'device.health_changed', {
      deviceId: device.id,
      previousHealth,
      currentHealth: device.health,
      reason: `Telemetry thresholds: CPU ${metrics.cpuUsage}%, RAM ${metrics.ramUsage}%, Disk ${metrics.diskUsage}%`
    });
  }

  // Self-healing rules check: if any rule matches, execute action!
  for (const rule of store.automations.values()) {
    if (!rule.enabled) continue;
    if (rule.osTarget !== 'all' && rule.osTarget !== device.os) continue;

    if (rule.triggerType === 'service_stopped' && rule.targetServiceName && services) {
      const targetSvc = services.find(
        (s) => s.name.toLowerCase() === rule.targetServiceName?.toLowerCase()
      );
      if (targetSvc && targetSvc.status === 'stopped') {
        // Enqueue self-healing command
        const commandId = `cmd-auto-${uuidv4().substring(0, 6)}`;
        const autoCommand: DeviceCommand = {
          id: commandId,
          deviceId: device.id,
          orgId,
          commandType: rule.actionType as any,
          payload: { serviceName: rule.targetServiceName },
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        store.deviceCommands.set(commandId, autoCommand);

        rule.executionsCount += 1;
        rule.lastExecuted = new Date().toISOString();
        store.automations.set(rule.id, rule);

        store.automationLogs.unshift({
          id: uuidv4(),
          ruleId: rule.id,
          ruleName: rule.name,
          deviceId: device.id,
          deviceName: device.name,
          timestamp: new Date().toISOString(),
          status: 'running',
          details: `Triggered by stopped service: ${rule.targetServiceName}`
        });
      }
    }
  }

  // Find pending commands for this device
  const pendingCommands = Array.from(store.deviceCommands.values()).filter(
    (c) => c.deviceId === device.id && c.status === 'pending'
  );

  // Mark pending commands as dispatched
  for (const cmd of pendingCommands) {
    cmd.status = 'dispatched';
    cmd.dispatchedAt = new Date().toISOString();
    store.deviceCommands.set(cmd.id, cmd);
  }

  const response: AgentHeartbeatResponse = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingCommands
  };

  res.json(response);
});

// POST /api/v1/agents/command-result
router.post('/command-result', (req, res) => {
  const { commandId, status, output, error } = req.body;
  if (!commandId || !status) {
    res.status(400).json({ error: 'commandId and status are required' });
    return;
  }

  const command = store.deviceCommands.get(commandId);
  if (!command) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }

  command.status = status;
  command.output = output;
  command.error = error;
  command.completedAt = new Date().toISOString();
  store.deviceCommands.set(command.id, command);

  // Broadcast command update
  wsManager.broadcastToOrg(command.orgId, 'command.updated', {
    commandId: command.id,
    deviceId: command.deviceId,
    commandType: command.commandType,
    status: command.status,
    output: command.output
  });

  res.json({ success: true });
});

export default router;
