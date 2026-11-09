import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import {
  runCheckmkDiscoveryAndEvaluate,
  runAllActiveChecks,
  executeActiveCheck,
  getCheckmkTacticalOverview,
  ensureDefaultCheckmkRules
} from '../net/checkmkEngine.js';
import type {
  CheckmkActiveCheckConfig,
  CheckmkThresholdRule,
  CheckmkDowntime,
  CheckmkDiscoveryState
} from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/monitoring/overview
router.get('/overview', (req: AuthenticatedRequest, res) => {
  ensureDefaultCheckmkRules();
  if (store.monitoredHosts.size === 0) {
    runCheckmkDiscoveryAndEvaluate();
  }
  const clientId = typeof req.query.clientId === 'string' && req.query.clientId !== 'all' ? req.query.clientId : undefined;
  const hostId = typeof req.query.hostId === 'string' ? req.query.hostId : undefined;

  const hosts = Array.from(store.monitoredHosts.values()).filter(
    (h) => (!clientId || h.clientId === clientId) && (!hostId || h.id === hostId)
  );
  const hostIdSet = new Set(hosts.map((h) => h.id));
  const services = Array.from(store.serviceChecks.values()).filter((s) => hostIdSet.has(s.hostId));
  const activeChecks = Array.from(store.activeChecks.values()).filter(
    (a) => !clientId || !a.clientId || a.clientId === clientId
  );
  const rules = Array.from(store.thresholdRules.values());
  const downtimes = Array.from(store.downtimes.values()).filter((d) => d.active);

  res.json({
    overview: getCheckmkTacticalOverview(clientId),
    hosts,
    services,
    activeChecks,
    rules,
    downtimes
  });
});

// POST /api/v1/monitoring/discover — WATO Service Discovery & Re-Evaluation
router.post('/discover', async (req: AuthenticatedRequest, res) => {
  const hostId = typeof req.body?.hostId === 'string' ? req.body.hostId : undefined;
  const includeActive = req.body?.includeActive !== false;
  const stats = runCheckmkDiscoveryAndEvaluate(hostId);
  if (includeActive && !hostId) {
    await runAllActiveChecks();
  }
  const hosts = Array.from(store.monitoredHosts.values());
  const services = Array.from(store.serviceChecks.values());
  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'monitoring.discover',
    targetType: hostId ? 'host' : 'fleet',
    targetId: hostId || 'all',
    details: stats,
    ipAddress: req.ip
  });
  res.json({
    ok: true,
    ...stats,
    overview: getCheckmkTacticalOverview(),
    hosts,
    services
  });
});

// PATCH /api/v1/monitoring/services/discovery-state — WATO accept/ignore discovered services or enable/disable host monitoring
router.patch('/services/discovery-state', (req: AuthenticatedRequest, res) => {
  const { serviceIds, hostId, discoveryState, mode } = req.body || {};
  const validStates: CheckmkDiscoveryState[] = ['monitored', 'undecided', 'vanished', 'ignored'];
  const nextState: CheckmkDiscoveryState = validStates.includes(discoveryState) ? discoveryState : 'monitored';

  const CORE_PLUGINS = new Set([
    'cpu_utilization',
    'memory_usage',
    'filesystem_usage',
    'icmp_ping',
    'system_uptime',
    'smb_share',
    'backup_status'
  ]);

  let updated = 0;
  const affectedHostIds = new Set<string>();
  if (typeof hostId === 'string' && hostId) affectedHostIds.add(hostId);

  if (mode === 'disable' && typeof hostId === 'string' && hostId) {
    // Remove host from active monitoring and reset all its services to 'undecided' (Available)
    const h = store.monitoredHosts.get(hostId);
    if (h) {
      h.monitoringEnabled = false;
      store.monitoredHosts.set(h.id, h);
    }
    for (const svc of store.serviceChecks.values()) {
      if (svc.hostId === hostId && svc.discoveryState === 'monitored') {
        svc.discoveryState = 'undecided';
        store.serviceChecks.set(svc.id, svc);
        updated++;
      }
    }
  } else if (mode === 'core' && typeof hostId === 'string' && hostId) {
    // Enable host and monitor only core infrastructure metrics + drives/shares
    const h = store.monitoredHosts.get(hostId);
    if (h) {
      h.monitoringEnabled = true;
      store.monitoredHosts.set(h.id, h);
    }
    for (const svc of store.serviceChecks.values()) {
      if (svc.hostId === hostId && CORE_PLUGINS.has(svc.plugin)) {
        svc.discoveryState = 'monitored';
        store.serviceChecks.set(svc.id, svc);
        updated++;
      }
    }
  } else if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    for (const id of serviceIds) {
      const svc = store.serviceChecks.get(String(id));
      if (svc) {
        svc.discoveryState = nextState;
        store.serviceChecks.set(svc.id, svc);
        affectedHostIds.add(svc.hostId);
        updated++;
      }
    }
  } else if (typeof hostId === 'string' && hostId) {
    // Bulk update all 'undecided' services on hostId
    for (const svc of store.serviceChecks.values()) {
      if (svc.hostId === hostId && (svc.discoveryState === 'undecided' || mode === 'all')) {
        svc.discoveryState = nextState;
        store.serviceChecks.set(svc.id, svc);
        updated++;
      }
    }
  }

  // Reconcile `monitoringEnabled` for affected hosts based on whether they have any 'monitored' services left
  for (const hId of affectedHostIds) {
    const h = store.monitoredHosts.get(hId);
    if (!h) continue;
    const hasMonitored = Array.from(store.serviceChecks.values()).some(
      (s) => s.hostId === hId && s.discoveryState === 'monitored'
    );
    h.monitoringEnabled = hasMonitored;
    store.monitoredHosts.set(hId, h);
  }

  runCheckmkDiscoveryAndEvaluate(typeof hostId === 'string' ? hostId : undefined);
  res.json({
    ok: true,
    updated,
    overview: getCheckmkTacticalOverview(),
    hosts: Array.from(store.monitoredHosts.values()),
    services: Array.from(store.serviceChecks.values())
  });
});

// POST /api/v1/monitoring/acknowledge — Acknowledge or un-acknowledge a Host or Service problem
router.post('/acknowledge', (req: AuthenticatedRequest, res) => {
  const { targetType, id, comment, sticky = true, clear = false } = req.body || {};
  const nowIso = new Date().toISOString();
  const actor = req.user?.name || req.user?.email || 'Operator';

  if (targetType === 'host') {
    const h = store.monitoredHosts.get(String(id));
    if (!h) {
      res.status(404).json({ error: 'Host not found' });
      return;
    }
    h.acknowledged = clear
      ? undefined
      : { by: actor, at: nowIso, comment: String(comment || 'Acknowledged by operator'), sticky: Boolean(sticky) };
    store.monitoredHosts.set(h.id, h);
    store.persist();
    res.json({ ok: true, host: h, overview: getCheckmkTacticalOverview() });
    return;
  }

  const svc = store.serviceChecks.get(String(id));
  if (!svc) {
    res.status(404).json({ error: 'Service check not found' });
    return;
  }
  svc.acknowledged = clear
    ? undefined
    : { by: actor, at: nowIso, comment: String(comment || 'Acknowledged by operator'), sticky: Boolean(sticky) };
  store.serviceChecks.set(svc.id, svc);
  store.persist();
  res.json({ ok: true, service: svc, overview: getCheckmkTacticalOverview() });
});

// POST /api/v1/monitoring/downtimes — Schedule maintenance downtime window
router.post('/downtimes', (req: AuthenticatedRequest, res) => {
  const { hostId, serviceId, durationMinutes = 120, startTime, endTime, comment } = req.body || {};
  if (!hostId) {
    res.status(400).json({ error: 'hostId is required' });
    return;
  }
  const host = store.monitoredHosts.get(String(hostId));
  const svc = serviceId ? store.serviceChecks.get(String(serviceId)) : undefined;
  const now = new Date();
  const startIso = startTime ? new Date(startTime).toISOString() : now.toISOString();
  const endIso = endTime
    ? new Date(endTime).toISOString()
    : new Date(now.getTime() + Number(durationMinutes || 120) * 60_000).toISOString();

  const dt: CheckmkDowntime = {
    id: `dt-${uuidv4().substring(0, 8)}`,
    orgId: req.user!.orgId,
    hostId: String(hostId),
    hostName: host?.name || String(hostId),
    serviceId: serviceId ? String(serviceId) : undefined,
    serviceName: svc?.serviceName,
    startTime: startIso,
    endTime: endIso,
    comment: String(comment || 'Scheduled Maintenance Window'),
    createdBy: req.user?.name || req.user?.email || 'Operator',
    active: true,
    createdAt: now.toISOString()
  };

  store.downtimes.set(dt.id, dt);
  runCheckmkDiscoveryAndEvaluate(String(hostId));
  res.json({
    ok: true,
    downtime: dt,
    downtimes: Array.from(store.downtimes.values()).filter((d) => d.active),
    overview: getCheckmkTacticalOverview()
  });
});

// DELETE /api/v1/monitoring/downtimes/:id
router.delete('/downtimes/:id', (req: AuthenticatedRequest, res) => {
  const dt = store.downtimes.get(String(req.params.id));
  if (dt) {
    dt.active = false;
    store.downtimes.delete(dt.id);
    runCheckmkDiscoveryAndEvaluate(dt.hostId);
  }
  res.json({
    ok: true,
    downtimes: Array.from(store.downtimes.values()).filter((d) => d.active),
    overview: getCheckmkTacticalOverview()
  });
});

// POST /api/v1/monitoring/active-checks — Create or update an Active Check & run immediately
router.post('/active-checks', async (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.name || !b.target) {
    res.status(400).json({ error: 'name and target are required' });
    return;
  }
  const client = b.clientId ? store.clients.get(String(b.clientId)) : Array.from(store.clients.values())[0];
  const id = typeof b.id === 'string' && b.id ? b.id : `actchk-${uuidv4().substring(0, 8)}`;

  const cfg: CheckmkActiveCheckConfig = {
    id,
    orgId: req.user!.orgId,
    clientId: client?.id || String(b.clientId || ''),
    clientName: client?.name || String(b.clientName || 'ApexMSP Infrastructure'),
    siteId: String(b.siteId || '_default'),
    hostId: b.hostId ? String(b.hostId) : undefined,
    name: String(b.name).trim(),
    type: ['http_tls', 'tcp_port', 'icmp_ping', 'dns_lookup'].includes(b.type) ? b.type : 'http_tls',
    target: String(b.target).trim(),
    port: b.port ? Number(b.port) : undefined,
    expectedStatus: b.expectedStatus ? Number(b.expectedStatus) : 200,
    expectedBodySubstring: b.expectedBodySubstring ? String(b.expectedBodySubstring) : undefined,
    dnsRecordType: b.dnsRecordType || 'A',
    expectedDnsAnswer: b.expectedDnsAnswer ? String(b.expectedDnsAnswer) : undefined,
    warnMs: Number.isFinite(Number(b.warnMs)) ? Number(b.warnMs) : 500,
    critMs: Number.isFinite(Number(b.critMs)) ? Number(b.critMs) : 2000,
    certWarnDays: Number.isFinite(Number(b.certWarnDays)) ? Number(b.certWarnDays) : 30,
    certCritDays: Number.isFinite(Number(b.certCritDays)) ? Number(b.certCritDays) : 14,
    intervalSec: Number.isFinite(Number(b.intervalSec)) ? Number(b.intervalSec) : 60,
    enabled: b.enabled !== false,
    autoCreateTicket: Boolean(b.autoCreateTicket),
    createdAt: new Date().toISOString()
  };

  store.activeChecks.set(cfg.id, cfg);
  const service = await executeActiveCheck(cfg);
  store.persist();

  res.json({
    ok: true,
    activeCheck: cfg,
    service,
    activeChecks: Array.from(store.activeChecks.values()),
    overview: getCheckmkTacticalOverview()
  });
});

// POST /api/v1/monitoring/active-checks/:id/run — Execute immediate live probe
router.post('/active-checks/:id/run', async (req: AuthenticatedRequest, res) => {
  const cfg = store.activeChecks.get(String(req.params.id));
  if (!cfg) {
    res.status(404).json({ error: 'Active check not found' });
    return;
  }
  const service = await executeActiveCheck(cfg);
  store.persist();
  res.json({
    ok: true,
    activeCheck: cfg,
    service,
    overview: getCheckmkTacticalOverview()
  });
});

// DELETE /api/v1/monitoring/active-checks/:id
router.delete('/active-checks/:id', (req: AuthenticatedRequest, res) => {
  const cfg = store.activeChecks.get(String(req.params.id));
  if (cfg) {
    store.activeChecks.delete(cfg.id);
    for (const [sId, svc] of store.serviceChecks.entries()) {
      if (svc.activeCheckId === cfg.id) {
        store.serviceChecks.delete(sId);
      }
    }
    runCheckmkDiscoveryAndEvaluate();
  }
  res.json({
    ok: true,
    activeChecks: Array.from(store.activeChecks.values()),
    overview: getCheckmkTacticalOverview()
  });
});

// POST /api/v1/monitoring/rules — Create or update a Checkmk WATO Threshold Rule
router.post('/rules', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.name || !b.plugin) {
    res.status(400).json({ error: 'name and plugin are required' });
    return;
  }
  const id = typeof b.id === 'string' && b.id ? b.id : `rule-cmk-${uuidv4().substring(0, 8)}`;
  const rule: CheckmkThresholdRule = {
    id,
    orgId: req.user!.orgId,
    name: String(b.name).trim(),
    description: String(b.description || ''),
    plugin: b.plugin,
    clientId: b.clientId ? String(b.clientId) : undefined,
    hostRole: b.hostRole ? String(b.hostRole) : undefined,
    hostId: b.hostId ? String(b.hostId) : undefined,
    servicePattern: b.servicePattern ? String(b.servicePattern) : undefined,
    warnThreshold: Number(b.warnThreshold ?? 80),
    critThreshold: Number(b.critThreshold ?? 90),
    maxAttempts: Math.max(1, Number(b.maxAttempts ?? 3)),
    checkIntervalSec: Math.max(10, Number(b.checkIntervalSec ?? 60)),
    autoCreateTicket: Boolean(b.autoCreateTicket),
    enabled: b.enabled !== false,
    updatedAt: new Date().toISOString()
  };

  store.thresholdRules.set(rule.id, rule);
  runCheckmkDiscoveryAndEvaluate();
  res.json({
    ok: true,
    rule,
    rules: Array.from(store.thresholdRules.values()),
    overview: getCheckmkTacticalOverview()
  });
});

// DELETE /api/v1/monitoring/rules/:id
router.delete('/rules/:id', (req: AuthenticatedRequest, res) => {
  store.thresholdRules.delete(String(req.params.id));
  runCheckmkDiscoveryAndEvaluate();
  res.json({
    ok: true,
    rules: Array.from(store.thresholdRules.values()),
    overview: getCheckmkTacticalOverview()
  });
});

export default router;
