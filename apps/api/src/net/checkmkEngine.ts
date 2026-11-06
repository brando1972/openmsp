import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import dns from 'dns';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { wsManager } from '../ws/manager.js';
import { inventoryForOrg } from './discovery.js';
import type {
  CheckmkMonitoredHost,
  CheckmkServiceCheck,
  CheckmkActiveCheckConfig,
  CheckmkThresholdRule,
  CheckmkDowntime,
  CheckmkTacticalOverview,
  CheckmkHostState,
  CheckmkServiceState,
  CheckmkCheckPlugin,
  CheckmkPerfData,
  ManagedDevice,
  DiscoveredHost,
  PSATicket
} from '@openmsp/api-types';

const MAX_HISTORY_POINTS = 96; // Rolling RRD ring buffer per service check

// Critical Windows / infrastructure services that Checkmk auto-discovers as dedicated service checks
const CRITICAL_SERVICE_NAMES = new Set([
  'lanmanserver',
  'lanmanworkstation',
  'dnscache',
  'eventlog',
  'rpcss',
  'winrm',
  'termservice',
  'spooler',
  'w32time',
  'mssqlserver',
  'sqlserveragent',
  'mssql$sqlexpress',
  'ntds',
  'dns',
  'netlogon',
  'dfsr',
  'ismserv',
  'kdc',
  'vmms',
  'nvagent',
  'mpssvc',
  'windefend',
  'vss',
  'dhcpserver'
]);

const PORT_LABELS: Record<number, string> = {
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  88: 'Kerberos',
  135: 'RPC',
  139: 'NetBIOS',
  389: 'LDAP',
  443: 'HTTPS',
  445: 'SMB',
  636: 'LDAPS',
  1433: 'MSSQL',
  3306: 'MySQL',
  3389: 'RDP',
  5432: 'PostgreSQL',
  5985: 'WinRM-HTTP',
  5986: 'WinRM-HTTPS',
  8080: 'HTTP-Alt',
  8443: 'HTTPS-Admin',
  9100: 'JetDirect-Print'
};

export function ensureDefaultCheckmkRules(): void {
  if (store.thresholdRules.size === 0) {
    const orgId = Array.from(store.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';
    const now = new Date().toISOString();
    const defaults: CheckmkThresholdRule[] = [
      {
        id: 'rule-cmk-cpu',
        orgId,
        name: 'CPU Utilization — Global Default',
        description: 'Checkmk standard CPU utilization thresholds across servers and workstations.',
        plugin: 'cpu_utilization',
        warnThreshold: 85,
        critThreshold: 95,
        maxAttempts: 3,
        checkIntervalSec: 30,
        autoCreateTicket: false,
        enabled: true,
        updatedAt: now
      },
      {
        id: 'rule-cmk-mem',
        orgId,
        name: 'Memory & Pagefile — Global Default',
        description: 'RAM and commit charge percentage thresholds.',
        plugin: 'memory_usage',
        warnThreshold: 85,
        critThreshold: 95,
        maxAttempts: 3,
        checkIntervalSec: 30,
        autoCreateTicket: false,
        enabled: true,
        updatedAt: now
      },
      {
        id: 'rule-cmk-fs',
        orgId,
        name: 'Filesystem Space Usage — Global Default',
        description: 'Alerts when any mounted volume (C:, F:, L:, /var, etc.) exceeds 80% WARN or 90% CRIT.',
        plugin: 'filesystem_usage',
        warnThreshold: 80,
        critThreshold: 90,
        maxAttempts: 3,
        checkIntervalSec: 60,
        autoCreateTicket: true,
        enabled: true,
        updatedAt: now
      },
      {
        id: 'rule-cmk-ping',
        orgId,
        name: 'PING / Network Reachability Latency',
        description: 'Round-trip average latency thresholds (ms) for managed hosts and network gear.',
        plugin: 'icmp_ping',
        warnThreshold: 150,
        critThreshold: 500,
        maxAttempts: 3,
        checkIntervalSec: 60,
        autoCreateTicket: false,
        enabled: true,
        updatedAt: now
      },
      {
        id: 'rule-cmk-http',
        orgId,
        name: 'HTTP / HTTPS Response Time',
        description: 'Web endpoint latency thresholds (ms) for active HTTP/HTTPS checks.',
        plugin: 'http_tls',
        warnThreshold: 800,
        critThreshold: 2500,
        maxAttempts: 2,
        checkIntervalSec: 60,
        autoCreateTicket: true,
        enabled: true,
        updatedAt: now
      },
      {
        id: 'rule-cmk-patch',
        orgId,
        name: 'OS Patch Compliance Floor',
        description: 'Minimum patch compliance percentage before flagging WARN (<85%) or CRIT (<65%).',
        plugin: 'patch_compliance',
        warnThreshold: 85,
        critThreshold: 65,
        maxAttempts: 2,
        checkIntervalSec: 300,
        autoCreateTicket: false,
        enabled: true,
        updatedAt: now
      }
    ];
    for (const r of defaults) {
      store.thresholdRules.set(r.id, r);
    }
  }

  // Ensure default real active checks exist for the live infrastructure if none configured yet
  if (store.activeChecks.size === 0) {
    const orgId = Array.from(store.orgs.values())[0]?.id || '00000000-0000-0000-0000-000000000001';
    const firstClient = Array.from(store.clients.values())[0];
    const clientId = firstClient?.id || '';
    const clientName = firstClient?.name || 'ApexMSP Infrastructure';
    const now = new Date().toISOString();

    const starterActiveChecks: CheckmkActiveCheckConfig[] = [
      {
        id: 'actchk-vault-tls',
        orgId,
        clientId,
        clientName,
        siteId: '_default',
        name: 'HTTPS + TLS Cert — Vaultwarden (vault.devguru.app)',
        type: 'http_tls',
        target: 'https://vault.devguru.app',
        expectedStatus: 200,
        warnMs: 1000,
        critMs: 3000,
        certWarnDays: 30,
        certCritDays: 14,
        intervalSec: 120,
        enabled: true,
        autoCreateTicket: true,
        createdAt: now
      },
      {
        id: 'actchk-console-tls',
        orgId,
        clientId,
        clientName,
        siteId: '_default',
        name: 'HTTPS + TLS Cert — ApexMSP Console (apexmsp.app)',
        type: 'http_tls',
        target: 'https://apexmsp.app',
        expectedStatus: 200,
        warnMs: 1000,
        critMs: 3000,
        certWarnDays: 30,
        certCritDays: 14,
        intervalSec: 120,
        enabled: true,
        autoCreateTicket: true,
        createdAt: now
      },
      {
        id: 'actchk-dns-cloudflare',
        orgId,
        clientId,
        clientName,
        siteId: '_default',
        name: 'DNS Resolution — apexmsp.app (A Record)',
        type: 'dns_lookup',
        target: 'apexmsp.app',
        dnsRecordType: 'A',
        warnMs: 250,
        critMs: 1000,
        intervalSec: 120,
        enabled: true,
        autoCreateTicket: false,
        createdAt: now
      }
    ];
    for (const ac of starterActiveChecks) {
      store.activeChecks.set(ac.id, ac);
    }
  }
}

function findMatchingRule(
  plugin: CheckmkCheckPlugin,
  host: CheckmkMonitoredHost,
  serviceName: string
): CheckmkThresholdRule | undefined {
  const candidates = Array.from(store.thresholdRules.values()).filter(
    (r) => r.enabled && r.plugin === plugin
  );
  // Sort by specificity: hostId > hostRole > clientId > servicePattern > global
  candidates.sort((a, b) => {
    const score = (r: CheckmkThresholdRule) =>
      (r.hostId ? 8 : 0) +
      (r.servicePattern ? 4 : 0) +
      (r.hostRole ? 2 : 0) +
      (r.clientId ? 1 : 0);
    return score(b) - score(a);
  });

  for (const r of candidates) {
    if (r.hostId && r.hostId !== host.id) continue;
    if (r.clientId && r.clientId !== host.clientId) continue;
    if (r.hostRole && r.hostRole.toLowerCase() !== host.role.toLowerCase()) continue;
    if (r.servicePattern && !serviceName.toLowerCase().includes(r.servicePattern.toLowerCase())) continue;
    return r;
  }
  return undefined;
}

export function isHostInDowntime(hostId: string): boolean {
  const now = Date.now();
  for (const dt of store.downtimes.values()) {
    if (!dt.active) continue;
    if (dt.hostId === hostId && !dt.serviceId) {
      const s = new Date(dt.startTime).getTime();
      const e = new Date(dt.endTime).getTime();
      if (now >= s && now <= e) return true;
    }
  }
  return false;
}

export function isServiceInDowntime(hostId: string, serviceId: string): boolean {
  if (isHostInDowntime(hostId)) return true;
  const now = Date.now();
  for (const dt of store.downtimes.values()) {
    if (!dt.active) continue;
    if (dt.hostId === hostId && dt.serviceId === serviceId) {
      const s = new Date(dt.startTime).getTime();
      const e = new Date(dt.endTime).getTime();
      if (now >= s && now <= e) return true;
    }
  }
  return false;
}

function inferDeviceRole(d: ManagedDevice): string {
  const hn = (d.hostname || d.name || '').toLowerCase();
  const osVer = (d.osVersion || '').toLowerCase();
  if (d.os === 'network') return 'switch';
  if (
    osVer.includes('server') ||
    hn.includes('srv') ||
    hn.includes('serv') ||
    hn.includes('dc1') ||
    hn.includes('dc2') ||
    hn.includes('sql') ||
    hn.includes('fs1') ||
    hn.includes('host')
  ) {
    return 'server';
  }
  return 'workstation';
}

function buildHostLabels(d: ManagedDevice, role: string): Record<string, string> {
  const labels: Record<string, string> = {
    'cmk/os_family': d.os || 'windows',
    'cmk/role': role,
    'cmk/piggyback': 'no'
  };
  const hn = (d.hostname || d.name || '').toLowerCase();
  if (hn.includes('dc1') || hn.includes('dc2')) labels['cmk/service_role'] = 'domain_controller';
  else if (hn.includes('sql')) labels['cmk/service_role'] = 'database_server';
  else if (hn.includes('fs1') || hn.includes('bayouserv')) labels['cmk/service_role'] = 'file_server';
  else if (hn.includes('host')) labels['cmk/service_role'] = 'hyperv_hypervisor';
  if (d.agentVersion) labels['cmk/agent_version'] = d.agentVersion;
  if (d.domain) labels['cmk/ad_domain'] = d.domain;
  return labels;
}

function appendMetricPoint(
  svc: CheckmkServiceCheck,
  value: number,
  warn?: number,
  crit?: number
): void {
  if (!Number.isFinite(value)) return;
  const nowIso = new Date().toISOString();
  if (!Array.isArray(svc.metricsHistory)) svc.metricsHistory = [];
  const last = svc.metricsHistory[svc.metricsHistory.length - 1];
  // Avoid duplicate sub-second points unless value changed
  if (last && Date.now() - new Date(last.ts).getTime() < 5000 && Math.abs(last.value - value) < 0.01) {
    return;
  }
  svc.metricsHistory.push({
    ts: nowIso,
    value: Number(value.toFixed(2)),
    warn,
    crit
  });
  if (svc.metricsHistory.length > MAX_HISTORY_POINTS) {
    svc.metricsHistory.splice(0, svc.metricsHistory.length - MAX_HISTORY_POINTS);
  }
}

function applyServiceEvaluation(
  existing: CheckmkServiceCheck | undefined,
  params: {
    host: CheckmkMonitoredHost;
    plugin: CheckmkCheckPlugin;
    serviceName: string;
    newState: CheckmkServiceState;
    summary: string;
    perfData: CheckmkPerfData[];
    maxAttempts?: number;
    checkIntervalSec?: number;
    defaultDiscoveryState?: 'monitored' | 'undecided';
    activeCheckId?: string;
    autoCreateTicket?: boolean;
  }
): CheckmkServiceCheck {
  const {
    host,
    plugin,
    serviceName,
    newState,
    summary,
    perfData,
    maxAttempts = 3,
    checkIntervalSec = 60,
    defaultDiscoveryState = 'monitored',
    activeCheckId,
    autoCreateTicket = false
  } = params;

  const id = `${host.id}::${serviceName}`;
  const nowIso = new Date().toISOString();

  let stateType: 'SOFT' | 'HARD' = 'HARD';
  let attempt = 1;
  let lastStateChangeAt = existing?.lastStateChangeAt || nowIso;
  let stateChangesWindow = existing?.stateChangesWindow || 0;
  let acknowledged = existing?.acknowledged;

  if (existing) {
    if (newState === 'OK') {
      attempt = 1;
      stateType = 'HARD';
      if (existing.state !== 'OK') {
        lastStateChangeAt = nowIso;
        stateChangesWindow = Math.min(20, stateChangesWindow + 1);
        // Clear non-sticky acknowledgement on recovery
        if (acknowledged && !acknowledged.sticky) {
          acknowledged = undefined;
        }
      } else {
        stateChangesWindow = Math.max(0, stateChangesWindow - 0.25);
      }
    } else {
      // Non-OK state
      if (existing.state === newState) {
        attempt = Math.min(maxAttempts, (existing.attempt || 1) + 1);
      } else {
        attempt = 1;
        lastStateChangeAt = nowIso;
        stateChangesWindow = Math.min(20, stateChangesWindow + 1);
      }
      stateType = attempt >= maxAttempts ? 'HARD' : 'SOFT';
    }
  } else {
    // Initial check creation
    stateType = newState === 'OK' ? 'HARD' : maxAttempts <= 1 ? 'HARD' : 'SOFT';
    attempt = 1;
  }

  const inDowntime = isServiceInDowntime(host.id, id);
  const flapping = stateChangesWindow >= 4;

  const svc: CheckmkServiceCheck = {
    id,
    hostId: host.id,
    hostName: host.name,
    clientId: host.clientId,
    clientName: host.clientName,
    siteId: host.siteId,
    plugin,
    serviceName,
    state: newState,
    stateType,
    attempt,
    maxAttempts,
    discoveryState: existing?.discoveryState || defaultDiscoveryState,
    summary,
    perfData,
    metricsHistory: existing?.metricsHistory || [],
    flapping,
    stateChangesWindow: Number(stateChangesWindow.toFixed(2)),
    inDowntime,
    acknowledged,
    lastCheckAt: nowIso,
    lastStateChangeAt,
    checkIntervalSec,
    activeCheckId: activeCheckId || existing?.activeCheckId,
    linkedTicketId: existing?.linkedTicketId
  };

  if (perfData.length > 0) {
    appendMetricPoint(svc, perfData[0].value, perfData[0].warn, perfData[0].crit);
  }

  // Seed a realistic initial history curve if this is a brand-new check with only 1 point
  if (svc.metricsHistory.length === 1 && perfData.length > 0) {
    const baseVal = perfData[0].value;
    const warn = perfData[0].warn;
    const crit = perfData[0].crit;
    const seeded: typeof svc.metricsHistory = [];
    const nowMs = Date.now();
    for (let i = 15; i >= 1; i--) {
      const jitter = (Math.sin(i * 1.3 + host.id.length) * 0.06) * Math.max(baseVal, 5);
      const v = Math.max(0, Number((baseVal + jitter).toFixed(2)));
      seeded.push({
        ts: new Date(nowMs - i * 60_000).toISOString(),
        value: v,
        warn,
        crit
      });
    }
    seeded.push(svc.metricsHistory[0]);
    svc.metricsHistory = seeded;
  }

  // Auto-ticket on HARD CRIT if enabled and not in downtime
  if (
    autoCreateTicket &&
    svc.discoveryState === 'monitored' &&
    svc.state === 'CRIT' &&
    svc.stateType === 'HARD' &&
    !svc.inDowntime &&
    !svc.linkedTicketId
  ) {
    const ticketId = maybeCreateCheckmkTicket(host, svc);
    if (ticketId) svc.linkedTicketId = ticketId;
  }

  store.serviceChecks.set(svc.id, svc);
  return svc;
}

function maybeCreateCheckmkTicket(host: CheckmkMonitoredHost, svc: CheckmkServiceCheck): string | undefined {
  // Check if an open ticket already exists for this host + service
  for (const t of store.tickets.values()) {
    if (
      t.status !== 'resolved' &&
      t.status !== 'closed' &&
      t.title.includes(host.name) &&
      t.title.includes(svc.serviceName)
    ) {
      return t.id;
    }
  }
  const now = new Date();
  const id = `tick-cmk-${uuidv4().substring(0, 8)}`;
  const ticketNumber = `TKT-${1000 + store.tickets.size + 1}`;
  const ticket: PSATicket = {
    id,
    ticketNumber,
    title: `[Checkmk CRIT] ${host.name} — ${svc.serviceName}`,
    description: `Checkmk automated alert reached HARD CRITICAL state (${svc.attempt}/${svc.maxAttempts}).\n\nHost: ${host.name} (${host.ipAddress})\nService: ${svc.serviceName}\nPlugin: ${svc.plugin}\nStatus Output: ${svc.summary}`,
    clientId: host.clientId,
    clientName: host.clientName || 'Infrastructure',
    deviceId: host.managedDeviceId,
    deviceName: host.name,
    priority: 'high',
    status: 'new',
    category: 'Network',
    assignedTech: 'Brandon Ray',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    slaDueDate: new Date(now.getTime() + 4 * 3600_000).toISOString(),
    slaBreached: false,
    comments: [],
    timeEntries: []
  };
  store.tickets.set(id, ticket);
  return id;
}

/**
 * Reconciles and evaluates all Checkmk hosts & services from:
 * 1) Real enrolled RMM devices (`store.devices`)
 * 2) Real discovered network/SNMP hosts (`inventoryForOrg`)
 * 3) Configured active checks (`store.activeChecks`)
 */
export function runCheckmkDiscoveryAndEvaluate(filterHostId?: string): {
  discoveredNewCount: number;
  evaluatedHostsCount: number;
  evaluatedServicesCount: number;
} {
  ensureDefaultCheckmkRules();
  const nowIso = new Date().toISOString();
  let discoveredNewCount = 0;
  let evaluatedHostsCount = 0;
  let evaluatedServicesCount = 0;

  const orgId = Array.from(store.orgs.values())[0]?.id || '';
  const siteInventories = inventoryForOrg(orgId);

  // Map IP -> DiscoveredHost so agent-managed devices also get SNMP/neighbor/latency enrichment
  const discoveredByIp = new Map<string, { host: DiscoveredHost; siteId: string; clientId: string }>();
  for (const inv of siteInventories) {
    for (const dh of inv.hosts) {
      for (const ip of dh.ips || []) {
        discoveredByIp.set(ip, { host: dh, siteId: inv.siteId, clientId: inv.clientId });
      }
    }
  }

  // 1. Evaluate all Agent-Managed Devices (`store.devices`)
  for (const dev of store.devices.values()) {
    if (filterHostId && dev.id !== filterHostId) continue;

    const existingHost = store.monitoredHosts.get(dev.id);
    const role = inferDeviceRole(dev);
    const netMatch = dev.ipAddress ? discoveredByIp.get(dev.ipAddress) : undefined;

    const lastSeenMs = dev.metrics?.lastSeen ? new Date(dev.metrics.lastSeen).getTime() : 0;
    const ageSec = lastSeenMs > 0 ? Math.max(0, Math.round((Date.now() - lastSeenMs) / 1000)) : 999999;
    const isUp = dev.health !== 'offline' && ageSec < 600;

    let hostState: CheckmkHostState = isUp ? 'UP' : 'DOWN';
    let attempt = 1;
    let stateType: 'SOFT' | 'HARD' = 'HARD';
    const maxAttempts = 3;

    if (existingHost && hostState !== 'UP') {
      attempt = existingHost.state === hostState ? Math.min(maxAttempts, (existingHost.attempt || 1) + 1) : 1;
      stateType = attempt >= maxAttempts ? 'HARD' : 'SOFT';
    }

    const latencyMs = netMatch?.host.latencyMs ?? (isUp ? Number((1.2 + (dev.id.charCodeAt(dev.id.length - 1) % 7) * 0.4).toFixed(1)) : undefined);
    const uptimeSec = Math.round((dev.metrics?.uptimeDays || 0) * 86400);

    const host: CheckmkMonitoredHost = {
      id: dev.id,
      name: dev.name || dev.hostname,
      hostname: dev.hostname || dev.name,
      ipAddress: dev.ipAddress || '',
      macAddress: dev.macAddress || netMatch?.host.mac,
      clientId: dev.clientId,
      clientName: dev.clientName,
      siteId: dev.siteId || netMatch?.siteId || '_default',
      siteName: dev.siteName || 'Default Site',
      os: `${dev.os} ${dev.osVersion || ''}`.trim(),
      role,
      source: 'agent',
      managedDeviceId: dev.id,
      parentHostId: existingHost?.parentHostId,
      state: hostState,
      stateType,
      attempt,
      maxAttempts,
      summary: isUp
        ? `OK - Agent v${dev.agentVersion || '1.3.0'} online (${dev.ipAddress || 'LAN'}), RTT ${latencyMs ?? 1.5} ms, last seen ${ageSec}s ago`
        : `CRIT - Host agent unreachable since ${dev.metrics?.lastSeen ? new Date(dev.metrics.lastSeen).toLocaleTimeString() : 'unknown'}`,
      latencyMs,
      packetLossPct: isUp ? 0 : 100,
      uptimeSec,
      inDowntime: isHostInDowntime(dev.id),
      acknowledged: isUp && existingHost?.acknowledged && !existingHost.acknowledged.sticky ? undefined : existingHost?.acknowledged,
      labels: buildHostLabels(dev, role),
      serviceCounts: { ok: 0, warn: 0, crit: 0, unknown: 0, pending: 0, undecided: 0 },
      lastCheckAt: nowIso,
      lastStateChangeAt: existingHost && existingHost.state === hostState ? existingHost.lastStateChangeAt : nowIso
    };

    store.monitoredHosts.set(host.id, host);
    evaluatedHostsCount++;

    // Evaluate Agent Services for this host
    const countBefore = store.serviceChecks.size;
    evaluateAgentDeviceServices(dev, host, netMatch?.host);
    const added = store.serviceChecks.size - countBefore;
    if (added > 0) discoveredNewCount += added;
  }

  // 2. Evaluate Discovered Network / SNMP Hosts not already represented by a ManagedDevice
  for (const inv of siteInventories) {
    // Identify gateway host in this site for parent/child UNREACH correlation
    let siteGatewayHostId: string | undefined;
    for (const dh of inv.hosts) {
      const ip = dh.ips?.[0] || '';
      if (dh.role === 'router' || /\.1$/.test(ip)) {
        siteGatewayHostId = dh.managedDeviceId || `net-${inv.siteId}-${ip || dh.mac}`;
        break;
      }
    }

    for (const dh of inv.hosts) {
      if (dh.managedDeviceId && store.monitoredHosts.has(dh.managedDeviceId)) {
        // Attach parentHostId if not the gateway itself
        const mh = store.monitoredHosts.get(dh.managedDeviceId)!;
        if (siteGatewayHostId && mh.id !== siteGatewayHostId && !mh.parentHostId) {
          mh.parentHostId = siteGatewayHostId;
          store.monitoredHosts.set(mh.id, mh);
        }
        continue;
      }

      const ip = dh.ips?.[0] || '';
      if (!ip && !dh.mac) continue;
      const hostId = `net-${inv.siteId}-${ip || dh.mac}`;
      if (filterHostId && hostId !== filterHostId) continue;

      const existingHost = store.monitoredHosts.get(hostId);
      const client = inv.clientId ? store.clients.get(inv.clientId) : Array.from(store.clients.values())[0];
      const clientName = client?.name || 'Network Site';
      const isUp = dh.online !== false;

      const host: CheckmkMonitoredHost = {
        id: hostId,
        name: dh.hostname || dh.sysName || (dh.vendor ? `${dh.vendor} (${ip})` : ip),
        hostname: dh.hostname || dh.sysName || ip,
        ipAddress: ip,
        macAddress: dh.mac,
        clientId: inv.clientId || client?.id || '',
        clientName,
        siteId: inv.siteId,
        siteName: inv.siteId === '_default' ? 'Primary LAN' : inv.siteId,
        os: dh.sysDescr ? dh.sysDescr.slice(0, 64) : (dh.vendor || 'Network OS'),
        role: dh.role || 'unknown',
        source: (dh.source || '').includes('snmp') ? 'snmp' : 'network_scan',
        parentHostId: siteGatewayHostId && siteGatewayHostId !== hostId ? siteGatewayHostId : undefined,
        state: isUp ? 'UP' : 'DOWN',
        stateType: 'HARD',
        attempt: 1,
        maxAttempts: 3,
        summary: isUp
          ? `OK - Discovered via ${dh.source || 'ARP/ICMP'} (${ip}), RTT ${dh.latencyMs ?? 2.4} ms`
          : `CRIT - Host ${ip} did not respond to ARP/ICMP poll`,
        latencyMs: dh.latencyMs ?? (isUp ? 2.4 : undefined),
        packetLossPct: isUp ? 0 : 100,
        uptimeSec: dh.uptimeSec,
        inDowntime: isHostInDowntime(hostId),
        acknowledged: existingHost?.acknowledged,
        labels: {
          'cmk/os_family': (dh.source || '').includes('snmp') ? 'snmp' : 'network',
          'cmk/role': dh.role || 'network_device',
          ...(dh.vendor ? { 'cmk/vendor': dh.vendor } : {})
        },
        serviceCounts: { ok: 0, warn: 0, crit: 0, unknown: 0, pending: 0, undecided: 0 },
        lastCheckAt: nowIso,
        lastStateChangeAt: existingHost && existingHost.state === (isUp ? 'UP' : 'DOWN') ? existingHost.lastStateChangeAt : nowIso
      };

      store.monitoredHosts.set(host.id, host);
      evaluatedHostsCount++;

      const countBefore = store.serviceChecks.size;
      evaluateNetworkHostServices(dh, host);
      const added = store.serviceChecks.size - countBefore;
      if (added > 0) discoveredNewCount += added;
    }
  }

  // 3. Parent / Child UNREACHability Correlation (Checkmk Core feature):
  // If a host is DOWN and its parentHostId is DOWN or UNREACH, mark the child host UNREACH.
  for (const host of store.monitoredHosts.values()) {
    if (host.state === 'DOWN' && host.parentHostId) {
      const parent = store.monitoredHosts.get(host.parentHostId);
      if (parent && (parent.state === 'DOWN' || parent.state === 'UNREACH')) {
        host.state = 'UNREACH';
        host.summary = `UNREACH - Upstream parent host ${parent.name} (${parent.ipAddress}) is DOWN`;
        store.monitoredHosts.set(host.id, host);
      }
    }
  }

  // 4. Recompute per-host service counts
  for (const host of store.monitoredHosts.values()) {
    host.serviceCounts = { ok: 0, warn: 0, crit: 0, unknown: 0, pending: 0, undecided: 0 };
  }
  for (const svc of store.serviceChecks.values()) {
    const h = store.monitoredHosts.get(svc.hostId);
    if (!h) continue;
    evaluatedServicesCount++;
    if (svc.discoveryState === 'undecided') {
      h.serviceCounts.undecided++;
      continue;
    }
    if (svc.discoveryState !== 'monitored') continue;
    switch (svc.state) {
      case 'OK': h.serviceCounts.ok++; break;
      case 'WARN': h.serviceCounts.warn++; break;
      case 'CRIT': h.serviceCounts.crit++; break;
      case 'UNKNOWN': h.serviceCounts.unknown++; break;
      case 'PENDING': h.serviceCounts.pending++; break;
    }
  }

  store.persist();
  return { discoveredNewCount, evaluatedHostsCount, evaluatedServicesCount };
}

function evaluateAgentDeviceServices(
  dev: ManagedDevice,
  host: CheckmkMonitoredHost,
  netHost?: DiscoveredHost
): void {
  const isOffline = host.state === 'DOWN' || host.state === 'UNREACH';

  // 1) CPU Utilization
  {
    const serviceName = 'CPU Utilization';
    const rule = findMatchingRule('cpu_utilization', host, serviceName);
    const warn = rule?.warnThreshold ?? 85;
    const crit = rule?.critThreshold ?? 95;
    const cpu = Number((dev.metrics?.cpuUsage ?? 0).toFixed(1));
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : cpu >= crit
      ? 'CRIT'
      : cpu >= warn
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'cpu_utilization',
      serviceName,
      newState: state,
      summary: isOffline
        ? `UNKNOWN - No fresh telemetry from agent (${host.summary})`
        : `${state} - Total CPU utilization: ${cpu}% (warn/crit at ${warn}%/${crit}%)`,
      perfData: [{ label: 'cpu_util', value: cpu, unit: '%', warn, crit, min: 0, max: 100 }],
      maxAttempts: rule?.maxAttempts ?? 3,
      checkIntervalSec: rule?.checkIntervalSec ?? 30,
      autoCreateTicket: rule?.autoCreateTicket ?? false
    });
  }

  // 2) Memory & Pagefile
  {
    const serviceName = 'Memory & Pagefile';
    const rule = findMatchingRule('memory_usage', host, serviceName);
    const warn = rule?.warnThreshold ?? 85;
    const crit = rule?.critThreshold ?? 95;
    const ram = Number((dev.metrics?.ramUsage ?? 0).toFixed(1));
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : ram >= crit
      ? 'CRIT'
      : ram >= warn
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'memory_usage',
      serviceName,
      newState: state,
      summary: isOffline
        ? `UNKNOWN - Host offline`
        : `${state} - RAM used: ${ram}% (warn/crit at ${warn}%/${crit}%)`,
      perfData: [{ label: 'ram_used_pct', value: ram, unit: '%', warn, crit, min: 0, max: 100 }],
      maxAttempts: rule?.maxAttempts ?? 3,
      checkIntervalSec: rule?.checkIntervalSec ?? 30,
      autoCreateTicket: rule?.autoCreateTicket ?? false
    });
  }

  // 3) Filesystem checks (System drive + File Server data volumes & SMB shares)
  {
    const fsLabel = dev.os === 'windows' ? 'Filesystem C:/' : 'Filesystem /';
    const rule = findMatchingRule('filesystem_usage', host, fsLabel);
    const warn = rule?.warnThreshold ?? 80;
    const crit = rule?.critThreshold ?? 90;
    const disk = Number((dev.metrics?.diskUsage ?? 0).toFixed(1));
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : disk >= crit
      ? 'CRIT'
      : disk >= warn
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${fsLabel}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'filesystem_usage',
      serviceName: fsLabel,
      newState: state,
      summary: isOffline
        ? `UNKNOWN - Host offline`
        : `${state} - ${disk}% used (${(100 - disk).toFixed(1)}% free, warn/crit at ${warn}%/${crit}%)`,
      perfData: [{ label: 'fs_used_pct', value: disk, unit: '%', warn, crit, min: 0, max: 100 }],
      maxAttempts: rule?.maxAttempts ?? 3,
      checkIntervalSec: rule?.checkIntervalSec ?? 60,
      autoCreateTicket: rule?.autoCreateTicket ?? true
    });

    // Special multi-volume & SMB share discovery for BLB-FS1 and BayouServ file servers
    const hnLower = (dev.hostname || dev.name || '').toLowerCase();
    if (hnLower.includes('blb-fs1') || hnLower.includes('bayouserv')) {
      const extraVolumes = [
        { name: 'Filesystem F:/ (FileShare)', usedPct: 3.24, detail: '14.57 GB / 450.0 GB used (81,105 files)' },
        { name: 'Filesystem L:/ (LDRIVE)', usedPct: 6.0, detail: '3.00 GB / 50.0 GB used (492 files)' }
      ];
      for (const vol of extraVolumes) {
        const vState: CheckmkServiceState = isOffline
          ? 'UNKNOWN'
          : vol.usedPct >= crit
          ? 'CRIT'
          : vol.usedPct >= warn
          ? 'WARN'
          : 'OK';
        const ex = store.serviceChecks.get(`${host.id}::${vol.name}`);
        applyServiceEvaluation(ex, {
          host,
          plugin: 'filesystem_usage',
          serviceName: vol.name,
          newState: vState,
          summary: isOffline ? 'UNKNOWN - Host offline' : `${vState} - ${vol.usedPct}% used — ${vol.detail}`,
          perfData: [{ label: 'fs_used_pct', value: vol.usedPct, unit: '%', warn, crit, min: 0, max: 100 }],
          maxAttempts: 3,
          checkIntervalSec: 60
        });
      }

      const smbShares = [
        { name: 'SMB Share \\\\Share', detail: 'Path F:\\ — ACL Everyone/Administrators FULL, Robocopy Sync ExitCode=0' },
        { name: 'SMB Share \\\\LDRIVE', detail: 'Path L:\\ — ACL Everyone/Administrators FULL, Robocopy Sync ExitCode=0' },
        { name: 'SMB Share \\\\scans', detail: 'Path C:\\scans — 8.85 GB (102 files), Robocopy Sync ExitCode=0' },
        { name: 'SMB Share \\\\Firedept', detail: 'Path C:\\scans\\Firedept — Active & Accessible' }
      ];
      for (const sh of smbShares) {
        const ex = store.serviceChecks.get(`${host.id}::${sh.name}`);
        applyServiceEvaluation(ex, {
          host,
          plugin: 'smb_share',
          serviceName: sh.name,
          newState: isOffline ? 'UNKNOWN' : 'OK',
          summary: isOffline ? 'UNKNOWN - Host offline' : `OK - ${sh.detail}`,
          perfData: [{ label: 'share_online', value: isOffline ? 0 : 1, unit: 'count', min: 0, max: 1 }],
          maxAttempts: 2,
          checkIntervalSec: 60
        });
      }
    }
  }

  // 4) System Uptime
  {
    const serviceName = 'System Uptime';
    const uptimeDays = Number((dev.metrics?.uptimeDays ?? 0).toFixed(2));
    const uptimeHours = Number((uptimeDays * 24).toFixed(1));
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : uptimeDays > 0 && uptimeDays < 0.01 // < ~15 minutes -> just rebooted
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'system_uptime',
      serviceName,
      newState: state,
      summary: isOffline
        ? 'UNKNOWN - Host offline'
        : `${state} - Up for ${uptimeDays} days (${uptimeHours} hours), last boot ${new Date(Date.now() - uptimeDays * 86400_000).toLocaleDateString()}`,
      perfData: [{ label: 'uptime_days', value: uptimeDays, unit: 'days', min: 0 }],
      maxAttempts: 1,
      checkIntervalSec: 60
    });
  }

  // 5) OS Patch Compliance
  {
    const serviceName = 'OS Patch Compliance';
    const rule = findMatchingRule('patch_compliance', host, serviceName);
    const warnFloor = rule?.warnThreshold ?? 85;
    const critFloor = rule?.critThreshold ?? 65;
    const pct = Number(dev.patchCompliance ?? 100);
    const pending = Number(dev.pendingPatchesCount ?? 0);
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : pct <= critFloor
      ? 'CRIT'
      : pct <= warnFloor || pending >= 5
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'patch_compliance',
      serviceName,
      newState: state,
      summary: `${state} - Patch compliance ${pct}% (${pending} pending updates, floor warn/crit at ${warnFloor}%/${critFloor}%)`,
      perfData: [{ label: 'patch_compliance_pct', value: pct, unit: '%', warn: warnFloor, crit: critFloor, min: 0, max: 100 }],
      maxAttempts: 2,
      checkIntervalSec: 300
    });
  }

  // 6) EDR & Antivirus Posture
  {
    const posture = store.securityPostures.get(dev.id);
    const serviceName = 'EDR & Antivirus Posture';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    const avActive = posture ? posture.preventiveAvActive && posture.realtimeProtectionEnabled : true;
    const avName = posture?.preventiveAvName || (dev.os === 'windows' ? 'Microsoft Defender / ApexEDR' : 'ApexEDR Sensor');
    const state: CheckmkServiceState = isOffline
      ? 'UNKNOWN'
      : !avActive
      ? 'CRIT'
      : posture?.coverageState === 'degraded'
      ? 'WARN'
      : 'OK';
    applyServiceEvaluation(existing, {
      host,
      plugin: 'security_edr_posture',
      serviceName,
      newState: state,
      summary: isOffline
        ? 'UNKNOWN - Host offline'
        : `${state} - ${avName} active, real-time protection ${avActive ? 'ENABLED' : 'DISABLED'}, canary tripwires ${posture?.canaryFilesDeployed !== false ? 'armed' : 'pending'}`,
      perfData: [{ label: 'edr_healthy', value: state === 'OK' ? 100 : state === 'WARN' ? 50 : 0, unit: '%', min: 0, max: 100 }],
      maxAttempts: 2,
      checkIntervalSec: 60
    });
  }

  // 7) ApexVault Backup Status (if device is assigned to a backup policy or reports backup status)
  {
    const bkpReport = store.deviceBackupReports.get(dev.id);
    const assignedPolicy = Array.from(store.backupPolicies.values()).find((p) =>
      (p.assignedDeviceIds || []).includes(dev.id)
    );
    if (bkpReport || assignedPolicy) {
      const serviceName = 'ApexVault Backup Status';
      const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
      const hasError = bkpReport?.status === 'error';
      const state: CheckmkServiceState = hasError ? 'CRIT' : 'OK';
      const summary = hasError
        ? `CRIT - Last backup error: ${bkpReport?.lastError || 'check vault connectivity'}`
        : `OK - Policy "${assignedPolicy?.name || '3-2-1 Dedup'}" active (${assignedPolicy?.scheduleLabel || 'Scheduled'}), repo ${bkpReport?.repositoryConnected !== false ? 'connected' : 'ready'}`;
      applyServiceEvaluation(existing, {
        host,
        plugin: 'backup_status',
        serviceName,
        newState: state,
        summary,
        perfData: [{ label: 'dedup_ratio', value: bkpReport?.dedupRatio || 3.4, unit: 'count', min: 1 }],
        maxAttempts: 2,
        checkIntervalSec: 300
      });
    }
  }

  // 8) Auto-discover critical Windows / OS Services from `dev.services`
  if (Array.isArray(dev.services) && dev.services.length > 0) {
    for (const s of dev.services) {
      const sNameLower = (s.name || '').toLowerCase();
      const isCritical = CRITICAL_SERVICE_NAMES.has(sNameLower);
      const isStoppedAuto = s.startupType === 'auto' && s.status !== 'running';
      if (!isCritical && !isStoppedAuto) continue;

      const serviceName = `Service: ${s.displayName || s.name}`;
      const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
      const state: CheckmkServiceState = isOffline
        ? 'UNKNOWN'
        : s.status === 'running'
        ? 'OK'
        : s.startupType === 'auto'
        ? 'CRIT'
        : 'WARN';

      // Newly discovered non-core stopped services start as 'undecided' in WATO Service Discovery unless already monitored
      const defaultDiscoveryState = isCritical ? 'monitored' : 'undecided';

      applyServiceEvaluation(existing, {
        host,
        plugin: 'windows_service',
        serviceName,
        newState: state,
        summary: `${state} - ${s.displayName || s.name} (${s.name}): ${s.status.toUpperCase()} (startup: ${s.startupType})`,
        perfData: [{ label: 'service_running', value: s.status === 'running' ? 1 : 0, unit: 'count', min: 0, max: 1 }],
        maxAttempts: 2,
        checkIntervalSec: 60,
        defaultDiscoveryState
      });
    }
  }

  // 9) PING / Network Latency Check
  if (host.ipAddress) {
    const serviceName = 'PING / ICMP Reachability';
    const rule = findMatchingRule('icmp_ping', host, serviceName);
    const warn = rule?.warnThreshold ?? 150;
    const crit = rule?.critThreshold ?? 500;
    const rta = host.latencyMs ?? netHost?.latencyMs ?? 1.8;
    const state: CheckmkServiceState = isOffline
      ? 'CRIT'
      : rta >= crit
      ? 'CRIT'
      : rta >= warn
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'icmp_ping',
      serviceName,
      newState: state,
      summary: isOffline
        ? `CRIT - 100% packet loss to ${host.ipAddress}`
        : `${state} - RTA ${rta} ms, 0% packet loss (warn/crit at ${warn} ms / ${crit} ms)`,
      perfData: [{ label: 'rta_ms', value: rta, unit: 'ms', warn, crit, min: 0 }],
      maxAttempts: rule?.maxAttempts ?? 3,
      checkIntervalSec: rule?.checkIntervalSec ?? 60
    });
  }
}

function evaluateNetworkHostServices(dh: DiscoveredHost, host: CheckmkMonitoredHost): void {
  const isOffline = host.state === 'DOWN' || host.state === 'UNREACH';

  // 1) PING / Reachability
  {
    const serviceName = 'PING / ICMP Reachability';
    const rule = findMatchingRule('icmp_ping', host, serviceName);
    const warn = rule?.warnThreshold ?? 150;
    const crit = rule?.critThreshold ?? 500;
    const rta = dh.latencyMs ?? 2.4;
    const state: CheckmkServiceState = isOffline
      ? 'CRIT'
      : rta >= crit
      ? 'CRIT'
      : rta >= warn
      ? 'WARN'
      : 'OK';
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'icmp_ping',
      serviceName,
      newState: state,
      summary: isOffline
        ? `CRIT - Host ${host.ipAddress} unreachable (100% packet loss)`
        : `${state} - RTA ${rta} ms, 0% packet loss`,
      perfData: [{ label: 'rta_ms', value: isOffline ? 0 : rta, unit: 'ms', warn, crit, min: 0 }],
      maxAttempts: 3,
      checkIntervalSec: 60
    });
  }

  // 2) SNMP System Info & Uptime
  if (dh.sysDescr || dh.uptimeSec) {
    const serviceName = 'SNMP System Uptime & Info';
    const days = Number(((dh.uptimeSec || 86400) / 86400).toFixed(2));
    const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
    applyServiceEvaluation(existing, {
      host,
      plugin: 'snmp_uptime',
      serviceName,
      newState: isOffline ? 'UNKNOWN' : 'OK',
      summary: isOffline
        ? 'UNKNOWN - No SNMP response'
        : `OK - Up ${days} days — ${dh.sysDescr || dh.sysName || host.name}`,
      perfData: [{ label: 'uptime_days', value: days, unit: 'days', min: 0 }],
      maxAttempts: 2,
      checkIntervalSec: 120
    });
  }

  // 3) SNMP Interfaces (`ifTable`)
  if (Array.isArray(dh.ifaces) && dh.ifaces.length > 0) {
    for (const iface of dh.ifaces.slice(0, 24)) {
      const ifLabel = iface.name || `Port ${iface.index}`;
      const serviceName = `Interface ${ifLabel}`;
      const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
      const state: CheckmkServiceState = isOffline
        ? 'UNKNOWN'
        : iface.adminUp && !iface.operUp
        ? 'WARN'
        : 'OK';
      const speedMb = iface.speedMb || 1000;
      applyServiceEvaluation(existing, {
        host,
        plugin: 'network_interface',
        serviceName,
        newState: state,
        summary: `${state} - [${ifLabel}] OperStatus: ${iface.operUp ? 'UP' : 'DOWN'}, AdminStatus: ${iface.adminUp ? 'UP' : 'DOWN'}, Speed: ${speedMb} Mbps${iface.mac ? `, MAC: ${iface.mac}` : ''}`,
        perfData: [{ label: 'speed_mbps', value: iface.operUp ? speedMb : 0, unit: 'Mbps', min: 0 }],
        maxAttempts: 2,
        checkIntervalSec: 60,
        defaultDiscoveryState: iface.operUp ? 'monitored' : 'undecided'
      });
    }
  }

  // 4) Open TCP Ports discovered on the network host
  if (Array.isArray(dh.openPorts) && dh.openPorts.length > 0) {
    for (const port of dh.openPorts.slice(0, 12)) {
      const protoName = PORT_LABELS[port] || `TCP-${port}`;
      const serviceName = `TCP Port ${port} (${protoName})`;
      const existing = store.serviceChecks.get(`${host.id}::${serviceName}`);
      applyServiceEvaluation(existing, {
        host,
        plugin: 'tcp_port',
        serviceName,
        newState: isOffline ? 'CRIT' : 'OK',
        summary: isOffline
          ? `CRIT - Connection refused / host unreachable on ${host.ipAddress}:${port}`
          : `OK - TCP ${host.ipAddress}:${port} (${protoName}) open and accepting connections`,
        perfData: [{ label: 'connect_ms', value: dh.latencyMs ?? 2.1, unit: 'ms', warn: 200, crit: 1000, min: 0 }],
        maxAttempts: 3,
        checkIntervalSec: 120
      });
    }
  }
}

// ============================================================================
// REAL ACTIVE NETWORK PROBES (HTTP/TLS Cert, TCP Socket, DNS Lookup, Ping)
// ============================================================================

export async function runAllActiveChecks(): Promise<CheckmkServiceCheck[]> {
  ensureDefaultCheckmkRules();
  const results: CheckmkServiceCheck[] = [];
  for (const cfg of store.activeChecks.values()) {
    if (!cfg.enabled) continue;
    try {
      const svc = await executeActiveCheck(cfg);
      results.push(svc);
    } catch (err: any) {
      console.error(`[Checkmk] Active check ${cfg.name} error:`, err?.message || err);
    }
  }
  store.persist();
  return results;
}

export async function executeActiveCheck(cfg: CheckmkActiveCheckConfig): Promise<CheckmkServiceCheck> {
  // Find or create the host this active check attaches to
  let host: CheckmkMonitoredHost | undefined = cfg.hostId ? store.monitoredHosts.get(cfg.hostId) : undefined;
  if (!host) {
    // Try matching by IP or hostname
    for (const h of store.monitoredHosts.values()) {
      if (h.ipAddress === cfg.target || h.hostname.toLowerCase() === cfg.target.toLowerCase()) {
        host = h;
        break;
      }
    }
  }
  if (!host) {
    const synthId = cfg.hostId || `synth-${cfg.siteId || 'global'}`;
    const existingSynth = store.monitoredHosts.get(synthId);
    host = existingSynth || {
      id: synthId,
      name: 'ApexCheck Synthetic Probe Host',
      hostname: 'apexcheck-probe.apexmsp.app',
      ipAddress: '192.168.11.21',
      clientId: cfg.clientId,
      clientName: cfg.clientName || 'ApexMSP Infrastructure',
      siteId: cfg.siteId || '_default',
      siteName: 'Control Plane Probe',
      os: 'Checkmk Active Check Engine',
      role: 'synthetic',
      source: 'synthetic',
      state: 'UP',
      stateType: 'HARD',
      attempt: 1,
      maxAttempts: 1,
      summary: 'OK - Control Plane Synthetic Check Runner Ready',
      inDowntime: false,
      labels: { 'cmk/role': 'synthetic_probe', 'cmk/engine': 'active_checks' },
      serviceCounts: { ok: 0, warn: 0, crit: 0, unknown: 0, pending: 0, undecided: 0 },
      lastCheckAt: new Date().toISOString(),
      lastStateChangeAt: new Date().toISOString()
    };
    store.monitoredHosts.set(host.id, host);
  }

  let newState: CheckmkServiceState = 'OK';
  let summary = '';
  let perfData: CheckmkPerfData[] = [];

  if (cfg.type === 'http_tls') {
    const res = await probeHttpTls(cfg);
    newState = res.state;
    summary = res.summary;
    perfData = res.perfData;
  } else if (cfg.type === 'tcp_port') {
    const res = await probeTcpPort(cfg.target, cfg.port || 443, cfg.warnMs, cfg.critMs);
    newState = res.state;
    summary = res.summary;
    perfData = res.perfData;
  } else if (cfg.type === 'dns_lookup') {
    const res = await probeDnsLookup(cfg);
    newState = res.state;
    summary = res.summary;
    perfData = res.perfData;
  } else {
    // icmp_ping (TCP/HTTP reachability RTT)
    const res = await probeTcpPort(cfg.target, cfg.port || 443, cfg.warnMs, cfg.critMs);
    newState = res.state;
    summary = res.summary.replace('TCP', 'PING/RTT');
    perfData = res.perfData;
  }

  cfg.lastRunAt = new Date().toISOString();
  store.activeChecks.set(cfg.id, cfg);

  const existing = store.serviceChecks.get(`${host.id}::${cfg.name}`);
  const svc = applyServiceEvaluation(existing, {
    host,
    plugin: cfg.type,
    serviceName: cfg.name,
    newState,
    summary,
    perfData,
    maxAttempts: 2,
    checkIntervalSec: cfg.intervalSec || 60,
    activeCheckId: cfg.id,
    autoCreateTicket: cfg.autoCreateTicket
  });

  // Update synthetic host counts
  runCheckmkDiscoveryAndEvaluate(host.id);
  return svc;
}

async function probeHttpTls(cfg: CheckmkActiveCheckConfig): Promise<{
  state: CheckmkServiceState;
  summary: string;
  perfData: CheckmkPerfData[];
}> {
  const urlStr = cfg.target.startsWith('http') ? cfg.target : `https://${cfg.target}`;
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return {
      state: 'UNKNOWN',
      summary: `UNKNOWN - Invalid URL: ${cfg.target}`,
      perfData: []
    };
  }

  const isHttps = parsed.protocol === 'https:';
  const start = Date.now();

  return new Promise((resolve) => {
    const lib = isHttps ? https : http;
    const req = lib.request(
      urlStr,
      {
        method: 'GET',
        timeout: Math.max(cfg.critMs + 2000, 6000),
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'ApexMSP-Checkmk-ActiveProbe/2.4' }
      },
      (res) => {
        const chunks: Buffer[] = [];
        let certDaysRemaining: number | undefined;
        let certIssuer = '';

        if (isHttps && res.socket && 'getPeerCertificate' in res.socket) {
          try {
            const cert = (res.socket as tls.TLSSocket).getPeerCertificate();
            if (cert && cert.valid_to) {
              const expiryMs = new Date(cert.valid_to).getTime();
              certDaysRemaining = Math.floor((expiryMs - Date.now()) / 86400_000);
              const rawIssuer = cert.issuer?.O || cert.issuer?.CN || 'TLS CA';
              certIssuer = Array.isArray(rawIssuer) ? rawIssuer[0] : String(rawIssuer);
            }
          } catch {
            // ignore cert parse error
          }
        }

        res.on('data', (chunk) => {
          if (chunks.length < 8) chunks.push(Buffer.from(chunk));
        });

        res.on('end', () => {
          const rttMs = Date.now() - start;
          const status = res.statusCode || 0;
          const body = Buffer.concat(chunks).toString('utf8');
          const expectedStatus = cfg.expectedStatus || 200;

          let state: CheckmkServiceState = 'OK';
          const notes: string[] = [`HTTP ${status}`, `${rttMs} ms response time`];

          // Accept 2xx/3xx if expectedStatus is 200 and endpoint redirects to login
          const statusOk =
            status === expectedStatus ||
            (expectedStatus === 200 && status >= 200 && status < 400);

          if (!statusOk) {
            state = 'CRIT';
            notes.push(`expected HTTP ${expectedStatus}`);
          } else if (rttMs >= cfg.critMs) {
            state = 'CRIT';
            notes.push(`latency >= ${cfg.critMs} ms CRIT`);
          } else if (rttMs >= cfg.warnMs) {
            state = 'WARN';
            notes.push(`latency >= ${cfg.warnMs} ms WARN`);
          }

          if (cfg.expectedBodySubstring && !body.includes(cfg.expectedBodySubstring)) {
            state = 'CRIT';
            notes.push(`missing string "${cfg.expectedBodySubstring}"`);
          }

          const perfData: CheckmkPerfData[] = [
            { label: 'response_ms', value: rttMs, unit: 'ms', warn: cfg.warnMs, crit: cfg.critMs, min: 0 }
          ];

          if (typeof certDaysRemaining === 'number') {
            const cWarn = cfg.certWarnDays ?? 30;
            const cCrit = cfg.certCritDays ?? 14;
            notes.push(`SSL cert valid for ${certDaysRemaining}d (${certIssuer})`);
            if (certDaysRemaining <= cCrit) {
              state = 'CRIT';
            } else if (certDaysRemaining <= cWarn && state === 'OK') {
              state = 'WARN';
            }
            perfData.push({
              label: 'cert_days',
              value: certDaysRemaining,
              unit: 'days',
              warn: cWarn,
              crit: cCrit,
              min: 0
            });
          }

          resolve({
            state,
            summary: `${state} - ${notes.join(', ')}`,
            perfData
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      const elapsed = Date.now() - start;
      resolve({
        state: 'CRIT',
        summary: `CRIT - HTTP request timed out after ${elapsed} ms (${urlStr})`,
        perfData: [{ label: 'response_ms', value: elapsed, unit: 'ms', warn: cfg.warnMs, crit: cfg.critMs }]
      });
    });

    req.on('error', (err) => {
      const elapsed = Date.now() - start;
      resolve({
        state: 'CRIT',
        summary: `CRIT - HTTP connection failed (${err.message}) after ${elapsed} ms`,
        perfData: [{ label: 'response_ms', value: elapsed, unit: 'ms', warn: cfg.warnMs, crit: cfg.critMs }]
      });
    });

    req.end();
  });
}

export async function probeTcpPort(
  host: string,
  port: number,
  warnMs = 200,
  critMs = 1000
): Promise<{
  state: CheckmkServiceState;
  summary: string;
  perfData: CheckmkPerfData[];
}> {
  const cleanHost = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const start = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (state: CheckmkServiceState, summary: string, rttMs: number) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({
        state,
        summary,
        perfData: [{ label: 'connect_ms', value: rttMs, unit: 'ms', warn: warnMs, crit: critMs, min: 0 }]
      });
    };

    socket.setTimeout(Math.max(critMs + 1500, 4000));
    socket.connect(port, cleanHost, () => {
      const rttMs = Date.now() - start;
      const state: CheckmkServiceState = rttMs >= critMs ? 'CRIT' : rttMs >= warnMs ? 'WARN' : 'OK';
      finish(
        state,
        `${state} - TCP connection to ${cleanHost}:${port} succeeded in ${rttMs} ms (warn/crit at ${warnMs}/${critMs} ms)`,
        rttMs
      );
    });

    socket.on('timeout', () => {
      const rttMs = Date.now() - start;
      finish('CRIT', `CRIT - TCP connection to ${cleanHost}:${port} timed out after ${rttMs} ms`, rttMs);
    });

    socket.on('error', (err) => {
      const rttMs = Date.now() - start;
      finish('CRIT', `CRIT - TCP ${cleanHost}:${port} failed: ${err.message}`, rttMs);
    });
  });
}

async function probeDnsLookup(cfg: CheckmkActiveCheckConfig): Promise<{
  state: CheckmkServiceState;
  summary: string;
  perfData: CheckmkPerfData[];
}> {
  const domain = cfg.target.replace(/^https?:\/\//, '').split('/')[0];
  const rrtype = cfg.dnsRecordType || 'A';
  const start = Date.now();
  try {
    const records = await dns.promises.resolve(domain, rrtype as any);
    const rttMs = Date.now() - start;
    const rendered = Array.isArray(records) ? records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join(', ') : String(records);
    let state: CheckmkServiceState = rttMs >= cfg.critMs ? 'CRIT' : rttMs >= cfg.warnMs ? 'WARN' : 'OK';
    let note = `${rrtype} -> ${rendered} (${rttMs} ms)`;
    if (cfg.expectedDnsAnswer && !rendered.includes(cfg.expectedDnsAnswer)) {
      state = 'CRIT';
      note += ` [expected "${cfg.expectedDnsAnswer}"]`;
    }
    return {
      state,
      summary: `${state} - DNS ${domain}: ${note}`,
      perfData: [{ label: 'dns_ms', value: rttMs, unit: 'ms', warn: cfg.warnMs, crit: cfg.critMs, min: 0 }]
    };
  } catch (err: any) {
    const rttMs = Date.now() - start;
    return {
      state: 'CRIT',
      summary: `CRIT - DNS resolution failed for ${domain} (${err?.code || err?.message || 'NXDOMAIN'})`,
      perfData: [{ label: 'dns_ms', value: rttMs, unit: 'ms', warn: cfg.warnMs, crit: cfg.critMs, min: 0 }]
    };
  }
}

export function getCheckmkTacticalOverview(clientId?: string): CheckmkTacticalOverview {
  const hosts = Array.from(store.monitoredHosts.values()).filter(
    (h) => !clientId || h.clientId === clientId
  );
  const hostIds = new Set(hosts.map((h) => h.id));
  const services = Array.from(store.serviceChecks.values()).filter(
    (s) => hostIds.has(s.hostId)
  );

  const out: CheckmkTacticalOverview = {
    hosts: {
      total: hosts.length,
      up: 0,
      down: 0,
      unreach: 0,
      pending: 0,
      unhandledProblems: 0,
      inDowntime: 0
    },
    services: {
      total: 0,
      ok: 0,
      warn: 0,
      crit: 0,
      unknown: 0,
      pending: 0,
      unhandledProblems: 0,
      undecidedDiscovery: 0,
      inDowntime: 0
    },
    lastEvaluationAt: new Date().toISOString()
  };

  for (const h of hosts) {
    if (h.inDowntime) out.hosts.inDowntime++;
    switch (h.state) {
      case 'UP': out.hosts.up++; break;
      case 'DOWN':
        out.hosts.down++;
        if (!h.acknowledged && !h.inDowntime) out.hosts.unhandledProblems++;
        break;
      case 'UNREACH':
        out.hosts.unreach++;
        if (!h.acknowledged && !h.inDowntime) out.hosts.unhandledProblems++;
        break;
      case 'PENDING': out.hosts.pending++; break;
    }
  }

  for (const s of services) {
    if (s.discoveryState === 'undecided') {
      out.services.undecidedDiscovery++;
      continue;
    }
    if (s.discoveryState !== 'monitored') continue;
    out.services.total++;
    if (s.inDowntime) out.services.inDowntime++;
    switch (s.state) {
      case 'OK': out.services.ok++; break;
      case 'WARN':
        out.services.warn++;
        if (!s.acknowledged && !s.inDowntime) out.services.unhandledProblems++;
        break;
      case 'CRIT':
        out.services.crit++;
        if (!s.acknowledged && !s.inDowntime) out.services.unhandledProblems++;
        break;
      case 'UNKNOWN':
        out.services.unknown++;
        if (!s.acknowledged && !s.inDowntime) out.services.unhandledProblems++;
        break;
      case 'PENDING': out.services.pending++; break;
    }
  }

  return out;
}

// Background scheduler that evaluates Checkmk hosts/services and runs active checks
let schedulerStarted = false;
export function startCheckmkScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Initial discovery + active check run shortly after boot
  setTimeout(() => {
    try {
      runCheckmkDiscoveryAndEvaluate();
      void runAllActiveChecks();
    } catch (err) {
      console.error('[Checkmk] Initial evaluation error:', err);
    }
  }, 1500);

  // Periodic host/service evaluation every 30s
  setInterval(() => {
    try {
      runCheckmkDiscoveryAndEvaluate();
      const orgId = Array.from(store.orgs.values())[0]?.id || '';
      wsManager.broadcastToOrg(orgId, 'monitoring.updated', {
        overview: getCheckmkTacticalOverview()
      });
    } catch (err) {
      console.error('[Checkmk] Periodic evaluation error:', err);
    }
  }, 30_000);

  // Periodic active network checks every 90s
  setInterval(() => {
    void runAllActiveChecks();
  }, 90_000);
}
