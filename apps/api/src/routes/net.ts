import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { store } from '../db/store.js';
import {
  inventoryForOrg,
  topologyForSite,
  scanConfigFor,
  setScanConfig,
  requestScanNow,
  collectorFor
} from '../net/discovery.js';
import { openSession } from '../net/tunnel.js';
import type { SnmpCred } from '@openmsp/api-types';

function publicBase(req: AuthenticatedRequest): string {
  return process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

/**
 * Network discovery + topology — console-facing API (authenticated, tenant-scoped).
 * The discovery data is produced by the elected site collector agent (see
 * net/discovery.ts + the agent's netscan package). SNMP credentials are stored
 * server-side and never returned to the browser in the clear.
 */

const router = Router();
router.use(authenticate);

// Redact SNMP secrets before anything leaves the server.
function redactSnmp(snmp: SnmpCred[] | undefined) {
  return (snmp || []).map((c) => ({
    version: c.version,
    // show only that a value is set, never the value itself
    community: c.community ? '••••••' : '',
    user: c.user || '',
    authAlg: c.authAlg || '',
    privAlg: c.privAlg || '',
    hasAuthKey: !!c.authKey,
    hasPrivKey: !!c.privKey
  }));
}

// GET /api/v1/net/inventory — discovered devices across the org's sites.
router.get('/inventory', (req: AuthenticatedRequest, res) => {
  const orgId = req.user!.orgId;
  const sites = inventoryForOrg(orgId).map((inv) => ({
    siteId: inv.siteId,
    clientId: inv.clientId,
    prefixes: inv.prefixes,
    collectorDeviceId: inv.collectorDeviceId,
    method: inv.method,
    updatedAt: inv.updatedAt,
    hostCount: inv.hosts.length,
    hosts: inv.hosts
  }));
  res.json({ sites });
});

// GET /api/v1/net/topology?siteId=... — nodes + edges for the topology map.
router.get('/topology', (req: AuthenticatedRequest, res) => {
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : '_default';
  const graph = topologyForSite(siteId);
  res.json({ siteId, ...graph, collectorDeviceId: collectorFor(siteId) });
});

// GET /api/v1/net/config?siteId=... — scan config (SNMP secrets redacted).
router.get('/config', (req: AuthenticatedRequest, res) => {
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : '_default';
  const cfg = scanConfigFor(siteId);
  const stored = store.netScan.get(siteId);
  res.json({
    siteId,
    enabled: cfg ? cfg.enabled : (stored?.enabled ?? true),
    fullIntervalMin: cfg?.fullIntervalMin ?? 30,
    liveIntervalMin: cfg?.liveIntervalMin ?? 5,
    prefixes: cfg?.prefixes ?? [],
    snmp: redactSnmp(stored?.snmp),
    collectorDeviceId: collectorFor(siteId)
  });
});

// PUT /api/v1/net/config — update scan config for a site.
// Body: { siteId, enabled?, fullIntervalMin?, liveIntervalMin?, prefixes?, snmp? }
// snmp, when present, REPLACES the stored credential set (operator-managed).
router.put('/config', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  const siteId = typeof b.siteId === 'string' ? b.siteId : '_default';
  const patch: any = {};
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (Number.isFinite(b.fullIntervalMin)) patch.fullIntervalMin = b.fullIntervalMin;
  if (Number.isFinite(b.liveIntervalMin)) patch.liveIntervalMin = b.liveIntervalMin;
  if (Array.isArray(b.prefixes)) patch.prefixes = b.prefixes.filter((x: any) => typeof x === 'string');
  if (Array.isArray(b.snmp)) {
    patch.snmp = b.snmp.map((c: any): SnmpCred => ({
      version: c.version === '3' ? '3' : '2c',
      community: c.community || undefined,
      user: c.user || undefined,
      authKey: c.authKey || undefined,
      authAlg: c.authAlg || undefined,
      privKey: c.privKey || undefined,
      privAlg: c.privAlg || undefined
    }));
  }
  const next = setScanConfig(siteId, patch);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'net.set_scan_config', targetType: 'site', targetId: siteId,
    details: { enabled: next.enabled, fullIntervalMin: next.fullIntervalMin, snmpCount: (next.snmp || []).length },
    ipAddress: req.ip
  });
  res.json({ ok: true, siteId, snmp: redactSnmp(next.snmp) });
});

// POST /api/v1/net/scan-now — request an immediate full scan of a site.
router.post('/scan-now', (req: AuthenticatedRequest, res) => {
  const siteId = typeof req.body?.siteId === 'string' ? req.body.siteId : '_default';
  requestScanNow(siteId);
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'net.scan_now', targetType: 'site', targetId: siteId, details: {}, ipAddress: req.ip
  });
  res.json({ ok: true, siteId, collectorDeviceId: collectorFor(siteId) });
});

// POST /api/v1/net/tunnel/web — open a tunnel to a discovered device's web UI.
// Body: { ip, port, siteId? }
router.post('/tunnel/web', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  const siteId = typeof b.siteId === 'string' ? b.siteId : '_default';
  const ip = String(b.ip || '');
  const port = parseInt(String(b.port), 10);
  if (!ip || !Number.isFinite(port)) { res.status(400).json({ ok: false, url: '', error: 'ip and port required' }); return; }
  const r = openSession({ siteId, kind: 'web', ip, port, publicBase: publicBase(req) });
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'net.tunnel_web', targetType: 'device', targetId: `${ip}:${port}`,
    details: { siteId, ready: r.ready, sessionId: r.sessionId }, ipAddress: req.ip
  });
  res.json(r);
});

// POST /api/v1/net/tunnel/ssh — open an SSH tunnel to a discovered device.
// Body: { ip, port?, siteId? }
router.post('/tunnel/ssh', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  const siteId = typeof b.siteId === 'string' ? b.siteId : '_default';
  const ip = String(b.ip || '');
  const port = Number.isFinite(parseInt(String(b.port), 10)) ? parseInt(String(b.port), 10) : 22;
  if (!ip) { res.status(400).json({ ok: false, url: '', error: 'ip required' }); return; }
  const r = openSession({ siteId, kind: 'ssh', ip, port, publicBase: publicBase(req) });
  store.recordAudit({
    orgId: req.user!.orgId, userId: req.user!.id, actorName: req.user!.name,
    action: 'net.tunnel_ssh', targetType: 'device', targetId: `${ip}:${port}`,
    details: { siteId, ready: r.ready, sessionId: r.sessionId }, ipAddress: req.ip
  });
  res.json(r);
});

export default router;
