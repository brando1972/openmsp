import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { wsManager } from '../ws/manager.js';
import { electCollector, scanConfigFor, ingestScan } from '../net/discovery.js';
import { updateDirectiveFor, artifactPath } from '../releases/manifest.js';
import { meshClient } from '../mesh/meshClient.js';
import { createReadStream } from 'fs';
import type {
  AgentEnrollRequest,
  AgentEnrollResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  ManagedDevice,
  DeviceCommand,
  PSATicket
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

  // Deduplicate: check if a device with the same serialNumber, MAC, or hostname+os exists
  let existingDevice: ManagedDevice | undefined;
  for (const d of store.devices.values()) {
    const normSerial = (s?: string) => (s || '').trim().toLowerCase();
    const normMac = (m?: string) => (m || '').replace(/[:-]/g, '').trim().toLowerCase();
    const sameSerial = serialNumber && serialNumber !== 'WIN-SERIAL-UNKNOWN' && normSerial(d.serialNumber) === normSerial(serialNumber);
    const sameMac = macAddress && normMac(d.macAddress) === normMac(macAddress) && normMac(macAddress).length > 4;
    const sameHost = hostname && d.hostname && d.hostname.toLowerCase() === hostname.toLowerCase() && d.os === os;

    if (sameSerial || sameMac || sameHost) {
      existingDevice = d;
      break;
    }
  }

  let deviceId: string;
  let deviceSecret: string;

  if (existingDevice) {
    deviceId = existingDevice.id;
    deviceSecret = (existingDevice as any).deviceSecret || `sec-${uuidv4()}`;
    existingDevice.hostname = hostname || existingDevice.hostname;
    existingDevice.name = hostname || existingDevice.name;
    existingDevice.os = os || existingDevice.os;
    existingDevice.osVersion = osVersion || existingDevice.osVersion;
    if (serialNumber && serialNumber !== 'WIN-SERIAL-UNKNOWN') {
      existingDevice.serialNumber = serialNumber;
    }
    if (macAddress) existingDevice.macAddress = macAddress;
    if (ipAddress) existingDevice.ipAddress = ipAddress;
    existingDevice.publicIp = req.ip || existingDevice.publicIp;
    (existingDevice as any).deviceSecret = deviceSecret;
    existingDevice.updatedAt = new Date().toISOString();
    store.devices.set(deviceId, existingDevice);
  } else {
    deviceId = `dev-${os.substring(0, 3)}-${uuidv4().substring(0, 6)}`;
    deviceSecret = `sec-${uuidv4()}`;

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
    (newDevice as any).deviceSecret = deviceSecret;
    store.devices.set(deviceId, newDevice);
  }

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
  const { deviceId, deviceSecret, metrics, network, installedApps, services, eventLogs, rustDeskId, collector, agentVersion, arch } =
    req.body as AgentHeartbeatRequest;

  if (!deviceId || !deviceSecret) {
    res.status(401).json({ error: 'Device ID and secret are required' });
    return;
  }

  let device = store.devices.get(deviceId);
  if (!device) {
    const client = Array.from(store.clients.values())[0];
    const plat = (collector?.platform || arch || '').toLowerCase();
    const isWin = plat.includes('win') || plat.includes('microsoft');
    const isMac = plat.includes('darwin') || plat.includes('mac');
    const osType = isWin ? 'windows' : (isMac ? 'macos' : 'linux');
    const host = `desktop-${deviceId.slice(-6)}`;

    device = {
      id: deviceId,
      name: isWin ? `Windows Desktop (${deviceId.slice(-6)})` : (isMac ? `MacBook (${deviceId.slice(-6)})` : `Server (${deviceId.slice(-6)})`),
      hostname: host,
      clientId: client ? client.id : 'c-brandon-ray',
      clientName: client ? client.name : 'Brandon Ray',
      siteName: 'Primary',
      os: osType as any,
      osVersion: isWin ? 'Windows 11' : (isMac ? 'macOS Sequoia' : 'Linux'),
      serialNumber: '',
      ipAddress: network?.ipAddress || (req.ip?.replace(/^::ffff:/, '') || '127.0.0.1'),
      publicIp: req.ip?.replace(/^::ffff:/, '') || '',
      macAddress: network?.macAddress || '',
      health: 'healthy',
      metrics: {
        ...metrics,
        lastSeen: new Date().toISOString()
      },
      rustDeskId: rustDeskId || '',
      rustDeskOnline: false,
      agentVersion: agentVersion || '1.0.0',
      arch: arch || '',
      mdmEnrolled: false,
      encryptionStatus: 'encrypted',
      patchCompliance: 100,
      pendingPatchesCount: 0,
      installedApps: installedApps || [],
      services: services || [],
      eventLogs: [],
      tags: ['Live Agent'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    (device as any).deviceSecret = deviceSecret;
    store.devices.set(deviceId, device);
    console.log(`[agents] Auto-restored active heartbeating device ${deviceId} (${device.os})`);
  } else if ((device as any).deviceSecret && (device as any).deviceSecret !== deviceSecret) {
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
  if (agentVersion) device.agentVersion = agentVersion;
  if (arch) device.arch = arch;
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

  // Auto-provision Remote Support engine (MeshAgent) silently if device is not yet linked
  if (meshClient.configured()) {
    const meshNode = meshClient.resolveNode([device.hostname, device.name].filter(Boolean) as string[]);
    if (!meshNode) {
      const hasRecentMeshCmd = Array.from(store.deviceCommands.values()).some(
        (c) => c.deviceId === device.id &&
               (c.payload as any)?.purpose === 'provision-mesh-agent' &&
               (c.status === 'pending' || c.status === 'dispatched' || (c.completedAt && (Date.now() - new Date(c.completedAt).getTime() < 300000)))
      );
      if (!hasRecentMeshCmd) {
        const isWin = /windows/i.test(device.os);
        const meshCmd: DeviceCommand = {
          id: `cmd-mesh-${uuidv4().substring(0, 8)}`,
          deviceId: device.id,
          orgId,
          commandType: 'run_script',
          payload: {
            purpose: 'provision-mesh-agent',
            script: isWin
              ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$m = '$env:ProgramData\\ApexMSP\\meshagent64.exe'; New-Item -ItemType Directory -Force -Path '$env:ProgramData\\ApexMSP' | Out-Null; if (!(Get-Service 'Mesh Agent' -ErrorAction SilentlyContinue)) { Invoke-WebRequest -Uri 'https://mesh.apexmsp.app/meshagents?id=4&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib&installflags=0' -OutFile $m -UseBasicParsing; Start-Process -FilePath $m -ArgumentList '-install' -WindowStyle Hidden -Wait; Start-Sleep -Seconds 2; Start-Service 'Mesh Agent' -ErrorAction SilentlyContinue }"`
              : `if [ ! -f /usr/local/mesh/meshagent ] && [ ! -d /usr/local/mesh ]; then curl -fsSL "https://mesh.apexmsp.app/meshagents?script=1&meshid=ulSX8VuJN9hFinyXGPovEZ4o5ShNQY7AK06I94WuTLzN1AblKrSIrLVz9DZw8vib" | bash 2>/dev/null || true; fi`
          },
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        store.deviceCommands.set(meshCmd.id, meshCmd);
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

  // Site-collector election: pick one agent per site to run LAN discovery.
  const siteId = (device.siteId as string) || '_default';
  let isCollector = false;
  const leaseSeconds = 90;
  if (collector) {
    isCollector = electCollector(siteId, device.id, collector, leaseSeconds);
  }

  // Self-update: advertise a newer build for this agent's os/arch, if any.
  const publicBase = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const update = (agentVersion && arch)
    ? updateDirectiveFor(device.os, arch, agentVersion, publicBase)
    : null;

  const response: AgentHeartbeatResponse = {
    acknowledged: true,
    serverTime: new Date().toISOString(),
    pendingCommands,
    collector: isCollector,
    collectorLeaseSeconds: leaseSeconds,
    scanConfig: isCollector ? (scanConfigFor(siteId) ?? undefined) : undefined,
    update: update ?? undefined
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

// POST /api/v1/agents/network-scan — a collector uploads a LAN discovery result.
router.post('/network-scan', (req, res) => {
  const { deviceId, deviceSecret, scan } = req.body || {};
  if (!deviceId || !deviceSecret || !scan) {
    res.status(400).json({ error: 'deviceId, deviceSecret and scan are required' });
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
  try {
    ingestScan(deviceId, scan);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  const scanClient = device.clientId ? store.clients.get(device.clientId) : undefined;
  const orgId = ((scanClient as any)?.orgId as string) || Array.from(store.orgs.values())[0]?.id;
  if (orgId) {
    wsManager.broadcastToOrg(orgId, 'network.scan_updated' as any, {
      siteId: device.siteId || '_default',
      hosts: Array.isArray(scan.hosts) ? scan.hosts.length : 0,
      method: scan.method
    });
  }
  res.json({ acknowledged: true });
});

// POST /api/v1/agents/ticket — an end user files a support request from the
// agent (e.g. the menu-bar app). Device-authenticated (deviceId + deviceSecret),
// attributed to the device's client org. Body: { subject, description, priority? }.
router.post('/ticket', (req, res) => {
  const { deviceId, deviceSecret, subject, description, priority } = req.body || {};
  if (!deviceId || !deviceSecret || !subject) {
    res.status(400).json({ error: 'deviceId, deviceSecret and subject are required' });
    return;
  }
  const device = store.devices.get(deviceId);
  if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
  if ((device as any).deviceSecret && (device as any).deviceSecret !== deviceSecret) {
    res.status(401).json({ error: 'Invalid device secret' });
    return;
  }
  const client = device.clientId ? store.clients.get(device.clientId) : undefined;
  const pri = ['urgent', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium';
  const slaHours = pri === 'urgent' ? 2 : pri === 'high' ? 8 : pri === 'low' ? 48 : 24;
  const id = `tick-${uuidv4().substring(0, 8)}`;
  const ticket: PSATicket = {
    id,
    ticketNumber: `TICK-${1000 + store.tickets.size + 1}`,
    title: String(subject).slice(0, 200),
    description: String(description || '').slice(0, 4000),
    clientId: device.clientId,
    clientName: client ? client.name : 'Unassigned Client',
    deviceId: device.id,
    deviceName: device.name,
    priority: pri as any,
    status: 'new',
    category: 'Support' as any,
    assignedTech: 'Unassigned',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slaDueDate: new Date(Date.now() + slaHours * 3600 * 1000).toISOString(),
    slaBreached: false,
    comments: [],
    timeEntries: []
  };
  store.tickets.set(id, ticket);
  if (client) { (client as any).openTickets = ((client as any).openTickets || 0) + 1; store.clients.set(client.id, client); }
  const scanClient2 = client;
  const orgId2 = ((scanClient2 as any)?.orgId as string) || Array.from(store.orgs.values())[0]?.id;
  if (orgId2) {
    store.recordAudit({
      orgId: orgId2, actorName: device.name || 'Agent',
      action: 'ticket.created_by_agent', targetType: 'ticket', targetId: id,
      details: { deviceId: device.id, subject: ticket.title, priority: pri }, ipAddress: req.ip
    });
    wsManager.broadcastToOrg(orgId2, 'ticket.updated', { ticketId: id, ticketNumber: ticket.ticketNumber, status: 'new' });
  }
  res.json({ ok: true, ticketNumber: ticket.ticketNumber, id });
});

// GET /api/v1/agents/download/:os/:arch — stream the latest agent binary for a
// platform. Integrity is guaranteed by the SHA-256 the agent received over its
// authenticated heartbeat, so this download is unauthenticated (it is the same
// binary handed out at install time).
router.get('/download/:os/:arch', (req, res) => {
  const os = String(req.params.os).replace(/[^a-z0-9]/gi, '');
  const arch = String(req.params.arch).replace(/[^a-z0-9]/gi, '');
  const art = artifactPath(os, arch);
  if (!art) { res.status(404).json({ error: 'No build available for this platform' }); return; }
  res.setHeader('content-type', 'application/octet-stream');
  res.setHeader('content-disposition', `attachment; filename="${art.file}"`);
  createReadStream(art.path).on('error', () => { if (!res.headersSent) res.status(500).end(); }).pipe(res);
});

export default router;
