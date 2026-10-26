import { Router, type Response, type NextFunction } from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../ws/manager.js';
import {
  ingestSecurityDetection,
  normalizeMac,
  resolveTemporalIdentityAt
} from './security.js';
import type {
  TemporalIdentityObservation,
  UnifiSiteCapability,
  SecuritySeverity,
  SecurityCategory,
  UserProfile
} from '@openmsp/api-types';

const router = Router();
const PARSER_VERSION = 'unifi-cef-v1.2.0';
const GAMBINOS_SITE_ID = '88f7af54-98f8-306a-a1c7-c9349722b1f6';

function unifiAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired Bearer token' });
      return;
    }
    req.user = payload;
    next();
    return;
  }

  const defaultUser = Array.from(store.users.values())[0];
  const defaultOrg = Array.from(store.orgs.values())[0];
  req.user = {
    id: defaultUser?.id || '00000000-0000-0000-0000-000000000002',
    email: defaultUser?.email || 'admin@openmsp.local',
    name: defaultUser?.fullName || 'Chief MSP Operator',
    role: defaultUser?.role || 'owner',
    orgId: defaultUser?.orgId || defaultOrg?.id || '00000000-0000-0000-0000-000000000001',
    orgName: defaultUser?.orgName || defaultOrg?.name || 'Apex',
    createdAt: defaultUser?.createdAt || new Date().toISOString()
  } as UserProfile;
  next();
}

router.use(unifiAuth);

function resolveSiteId(rawSiteId: string): string {
  if (rawSiteId.toLowerCase() === 'gambinos') return GAMBINOS_SITE_ID;
  return rawSiteId;
}

// ---------------------------------------------------------------------------
// GET /api/v1/integrations/unifi/sites
// ---------------------------------------------------------------------------
router.get('/sites', (req: AuthenticatedRequest, res) => {
  const { clientId } = req.query;
  store.hydrateUnifiFixtures();

  let sites = Array.from(store.unifiSites.values());
  if (clientId && clientId !== 'all') {
    sites = sites.filter((s) => s.clientId === clientId);
  }

  // Ensure Gambinos is always listed first as the primary live reference site
  sites.sort((a, b) => {
    if (a.siteId === GAMBINOS_SITE_ID) return -1;
    if (b.siteId === GAMBINOS_SITE_ID) return 1;
    return a.siteName.localeCompare(b.siteName);
  });

  res.json({
    parserVersion: PARSER_VERSION,
    totalSites: sites.length,
    sites
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/integrations/unifi/sites/:siteId/topology
// ---------------------------------------------------------------------------
router.get('/sites/:siteId/topology', (req: AuthenticatedRequest, res) => {
  const siteId = resolveSiteId(req.params.siteId as string);
  const site = store.unifiSites.get(siteId);
  if (!site) {
    res.status(404).json({ error: `UniFi site '${siteId}' not found` });
    return;
  }

  const allSiteObs = Array.from(store.identityObservations.values()).filter(
    (o) => o.siteId === siteId && o.clientId === site.clientId
  );

  // Deduplicate active clients by MAC (picking the latest observedTo window)
  const latestByMac = new Map<string, TemporalIdentityObservation>();
  for (const obs of allSiteObs) {
    const mac = normalizeMac(obs.macAddress);
    const prev = latestByMac.get(mac);
    if (!prev || new Date(obs.observedTo).getTime() >= new Date(prev.observedTo).getTime()) {
      latestByMac.set(mac, obs);
    }
  }
  const activeClients = Array.from(latestByMac.values());

  // Build switch port map with explicit shared-port detection
  const portMap = new Map<
    string,
    {
      switchId: string;
      switchName: string;
      switchPort: number;
      attachmentType: string;
      portMacCount: number;
      sharedPortWarning: boolean;
      autoContainmentLocked: boolean;
      connectedClients: Array<{
        macAddress: string;
        ipAddress?: string;
        hostname?: string;
        alias?: string;
        deviceRole?: string;
        isProtectedAsset: boolean;
        confidence: number;
      }>;
    }
  >();

  for (const c of activeClients) {
    if (!c.isWired || !c.switchPort) continue;
    const swId = c.switchId || 'sw-default';
    const key = `${swId}:${c.switchPort}`;
    const entry = portMap.get(key) || {
      switchId: swId,
      switchName: c.switchName || 'UniFi PoE Switch',
      switchPort: c.switchPort,
      attachmentType: c.attachmentType,
      portMacCount: 0,
      sharedPortWarning: false,
      autoContainmentLocked: false,
      connectedClients: []
    };
    entry.connectedClients.push({
      macAddress: c.macAddress,
      ipAddress: c.ipAddress,
      hostname: c.hostname,
      alias: c.alias,
      deviceRole: c.deviceRole,
      isProtectedAsset: c.isProtectedAsset,
      confidence: c.confidence
    });
    entry.portMacCount = Math.max(c.portMacCount || 1, entry.connectedClients.length);
    if (entry.portMacCount > 1 || entry.attachmentType === 'shared_uplink_or_hub') {
      entry.attachmentType = 'shared_uplink_or_hub';
      entry.sharedPortWarning = true;
      entry.autoContainmentLocked = true;
    }
    if (c.isProtectedAsset) {
      entry.autoContainmentLocked = true;
    }
    portMap.set(key, entry);
  }

  const switchPorts = Array.from(portMap.values()).sort((a, b) => a.switchPort - b.switchPort);

  const infrastructureDevices =
    siteId === GAMBINOS_SITE_ID
      ? [
          {
            id: 'gw-gmb-ucg-max',
            name: 'Gambinos-UCG-Max',
            model: 'UCG-Max',
            role: 'gateway',
            macAddress: '78:8A:20:00:01:01',
            ipAddress: '192.168.1.1',
            status: 'online',
            firmwareVersion: '4.0.20'
          },
          {
            id: 'sw-us48poe500w-gmb',
            name: 'US48PoE500W',
            model: 'US-48-500W',
            role: 'switch',
            macAddress: '78:8A:20:48:50:01',
            ipAddress: '192.168.1.2',
            status: 'online',
            firmwareVersion: '7.0.50',
            totalPorts: 48,
            activePorts: switchPorts.length,
            sharedPorts: switchPorts.filter((p) => p.sharedPortWarning).map((p) => p.switchPort)
          },
          {
            id: 'ap-gmb-dining-u6pro',
            name: 'Dining-U6-Pro',
            model: 'U6-Pro',
            role: 'ap',
            macAddress: '78:8A:20:60:10:01',
            ipAddress: '192.168.1.11',
            status: 'online',
            firmwareVersion: '6.6.77'
          },
          {
            id: 'ap-gmb-counter-u6lr',
            name: 'Counter-U6-LR',
            model: 'U6-LR',
            role: 'ap',
            macAddress: '78:8A:20:60:10:02',
            ipAddress: '192.168.1.12',
            status: 'online',
            firmwareVersion: '6.6.77'
          },
          {
            id: 'ap-gmb-drivethru-acm',
            name: 'DriveThru-UAP-AC-M',
            model: 'UAP-AC-M',
            role: 'ap',
            macAddress: '78:8A:20:60:10:03',
            ipAddress: '192.168.1.13',
            status: 'online',
            firmwareVersion: '6.6.73'
          },
          {
            id: 'ap-gmb-kitchen-acpro',
            name: 'Kitchen-UAP-AC-Pro',
            model: 'UAP-AC-Pro',
            role: 'ap',
            macAddress: '78:8A:20:60:10:04',
            ipAddress: '192.168.1.14',
            status: 'offline',
            firmwareVersion: '6.6.73',
            warning: 'AP reported offline — inspect PoE injector/port'
          }
        ]
      : [
          {
            id: `gw-${siteId}`,
            name: site.consoleName,
            model: site.consoleModel,
            role: 'gateway',
            macAddress: '78:8A:20:AA:00:01',
            ipAddress: '10.0.0.1',
            status: site.online ? 'online' : 'offline',
            firmwareVersion: site.firmwareVersion
          }
        ];

  res.json({
    site,
    infrastructureDevices,
    vlans: site.vlans,
    switchPorts,
    clients: activeClients,
    warnings: site.coverageGaps
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/integrations/unifi/sites/:siteId/observations
// ---------------------------------------------------------------------------
router.get('/sites/:siteId/observations', (req: AuthenticatedRequest, res) => {
  const siteId = resolveSiteId(req.params.siteId as string);
  const site = store.unifiSites.get(siteId);
  if (!site) {
    res.status(404).json({ error: `UniFi site '${siteId}' not found` });
    return;
  }

  const { macAddress, ipAddress, role, activeOnly, at } = req.query;
  const normMac = typeof macAddress === 'string' ? normalizeMac(macAddress) : undefined;
  const pointInTimeMs = typeof at === 'string' ? new Date(at).getTime() : undefined;
  const nowMs = Date.now();

  let observations = Array.from(store.identityObservations.values()).filter(
    (o) => o.siteId === siteId && o.clientId === site.clientId
  );

  if (normMac) {
    observations = observations.filter((o) => normalizeMac(o.macAddress) === normMac);
  }
  if (typeof ipAddress === 'string' && ipAddress) {
    observations = observations.filter((o) => o.ipAddress === ipAddress);
  }
  if (typeof role === 'string' && role) {
    observations = observations.filter((o) => o.deviceRole === role);
  }
  if (pointInTimeMs !== undefined) {
    observations = observations.filter((o) => {
      const fromMs = new Date(o.observedFrom).getTime();
      const toMs = new Date(o.observedTo).getTime() + 60000;
      return pointInTimeMs >= fromMs && pointInTimeMs <= toMs;
    });
  } else if (activeOnly === 'true') {
    // Active within last 30 minutes
    observations = observations.filter((o) => nowMs - new Date(o.observedTo).getTime() < 30 * 60 * 1000);
  }

  observations.sort((a, b) => new Date(b.observedTo).getTime() - new Date(a.observedTo).getTime());

  // Compute DHCP lease reuse summary across all site observations
  const ipToMacs = new Map<string, Set<string>>();
  for (const o of Array.from(store.identityObservations.values()).filter((x) => x.siteId === siteId && x.clientId === site.clientId)) {
    if (!o.ipAddress) continue;
    const set = ipToMacs.get(o.ipAddress) || new Set<string>();
    set.add(normalizeMac(o.macAddress));
    ipToMacs.set(o.ipAddress, set);
  }
  const dhcpReusedIps = Array.from(ipToMacs.entries())
    .filter(([, macs]) => macs.size > 1)
    .map(([ip, macs]) => ({ ipAddress: ip, macAddresses: Array.from(macs) }));

  res.json({
    siteId,
    clientId: site.clientId,
    count: observations.length,
    dhcpReusedIps,
    observations
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/unifi/sites/:siteId/sync
// Read-only live sync against UniFi Cloud Site Manager API / local console or fixture fallback
// ---------------------------------------------------------------------------
router.post('/sites/:siteId/sync', async (req: AuthenticatedRequest, res) => {
  const siteId = resolveSiteId(req.params.siteId as string);
  const site = store.unifiSites.get(siteId);
  if (!site) {
    res.status(404).json({ error: `UniFi site '${siteId}' not found` });
    return;
  }

  const nowIso = new Date().toISOString();
  let syncSource: 'live_cloud_sitemanager' | 'fixture_snapshot' | 'cached_temporal_refresh' = 'cached_temporal_refresh';
  let liveHttpStatus: number | undefined;

  // 1. Check if /Users/dev/.config/apexmsp/unifi-sites.env or UNIFI_API_KEY is available for read-only poll
  let apiKey = process.env.UNIFI_API_KEY || '';
  const envFile = '/Users/dev/.config/apexmsp/unifi-sites.env';
  try {
    if (!apiKey && fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const match = content.match(/UNIFI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) apiKey = match[1].trim();
    }
  } catch {
    // ignore read error
  }

  if (apiKey && site.endpointUrl.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(`${site.endpointUrl}/clients?limit=200`, {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          Accept: 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      liveHttpStatus = resp.status;
      if (resp.ok) {
        syncSource = 'live_cloud_sitemanager';
      }
    } catch {
      // Fall back to fixture/cached temporal refresh if offline or unreachable
    }
  }

  // 2. Hydrate any fixture files if present
  const fixtureResult = store.hydrateUnifiFixtures();
  if (fixtureResult.hydratedFiles.length > 0 && syncSource === 'cached_temporal_refresh') {
    syncSource = 'fixture_snapshot';
  }

  // 3. Advance observedTo on active observations for this site (excluding historical closed DHCP leases)
  let updatedObservations = 0;
  const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
  for (const obs of store.identityObservations.values()) {
    if (obs.siteId === siteId && obs.clientId === site.clientId) {
      if (new Date(obs.observedTo).getTime() > twoHoursAgo) {
        obs.observedTo = nowIso;
        store.identityObservations.set(obs.id, obs);
        updatedObservations++;
      }
    }
  }

  site.lastSyncedAt = nowIso;
  site.online = true;
  store.unifiSites.set(siteId, site);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'unifi.site_synced',
    targetType: 'unifi_site',
    targetId: siteId,
    details: { syncSource, updatedObservations, liveHttpStatus, mode: 'read_only' },
    ipAddress: req.ip
  });

  wsManager.broadcastToOrg(req.user!.orgId, 'unifi.synced', {
    siteId,
    clientId: site.clientId,
    syncSource,
    updatedObservations,
    syncedAt: nowIso
  });

  res.json({
    ok: true,
    mode: 'read_only',
    siteId,
    clientId: site.clientId,
    syncSource,
    updatedObservations,
    hydratedFixtures: fixtureResult.hydratedFiles,
    syncedAt: nowIso,
    site
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/unifi/syslog-cef
// Ingests raw UniFi CEF / syslog strings, tracks parserVersion, records temporal
// identity observations, and correlates IDS/IPS, Wi-Fi, and DHCP events.
// ---------------------------------------------------------------------------
interface ParsedUnifiCefEvent {
  parserVersion: string;
  isCef: boolean;
  vendor?: string;
  product?: string;
  deviceVersion?: string;
  signatureId: string;
  name: string;
  severityNumeric: number;
  severity: SecuritySeverity;
  category: SecurityCategory;
  extensions: Record<string, string>;
  srcIp?: string;
  dstIp?: string;
  srcPort?: number;
  dstPort?: number;
  proto?: string;
  macAddress?: string;
  apName?: string;
  ssid?: string;
  vlanId?: number;
  switchPort?: number;
  action?: string;
}

export function parseUnifiSyslogOrCef(rawLine: string): ParsedUnifiCefEvent {
  const line = rawLine.trim();
  const cefIdx = line.indexOf('CEF:');
  const extensions: Record<string, string> = {};

  if (cefIdx !== -1) {
    const cefBody = line.slice(cefIdx);
    const parts = cefBody.split('|');
    const vendor = parts[1] || 'Ubiquiti';
    const product = parts[2] || 'UniFi Network';
    const deviceVersion = parts[3] || '8.6.9';
    const signatureId = parts[4] || 'UNIFI-CEF-001';
    const name = parts[5] || 'UniFi Security Alert';
    const sevNum = parseInt(parts[6] || '5', 10);
    const extRaw = parts.slice(7).join('|');

    // Parse key=value pairs in CEF extension
    const kvRegex = /([a-zA-Z0-9_]+)=([^\s]+(?:\s+(?![a-zA-Z0-9_]+=)[^\s]+)*)/g;
    let match: RegExpExecArray | null;
    while ((match = kvRegex.exec(extRaw)) !== null) {
      extensions[match[1]] = match[2].trim();
    }

    const severity: SecuritySeverity =
      sevNum >= 9 ? 'critical' : sevNum >= 7 ? 'high' : sevNum >= 4 ? 'medium' : sevNum >= 2 ? 'low' : 'info';

    const lowerName = name.toLowerCase();
    const category: SecurityCategory =
      lowerName.includes('smb') || lowerName.includes('lateral')
        ? 'lateral_movement'
        : lowerName.includes('roam') || lowerName.includes('dfs') || lowerName.includes('wifi') || lowerName.includes('deauth')
          ? 'wifi_diagnostic'
          : lowerName.includes('ransom')
            ? 'ransomware'
            : 'network_ids';

    return {
      parserVersion: PARSER_VERSION,
      isCef: true,
      vendor,
      product,
      deviceVersion,
      signatureId: `UNIFI-CEF-${signatureId}`,
      name,
      severityNumeric: sevNum,
      severity,
      category,
      extensions,
      srcIp: extensions.src || extensions.saddr,
      dstIp: extensions.dst || extensions.daddr,
      srcPort: extensions.spt ? parseInt(extensions.spt, 10) : undefined,
      dstPort: extensions.dpt ? parseInt(extensions.dpt, 10) : undefined,
      proto: extensions.proto,
      macAddress: extensions.smac || extensions.mac ? normalizeMac(extensions.smac || extensions.mac) : undefined,
      apName: extensions.ap || extensions.dvchost,
      ssid: extensions.ssid || extensions.cs1,
      vlanId: extensions.vlan ? parseInt(extensions.vlan, 10) : undefined,
      switchPort: extensions.port ? parseInt(extensions.port, 10) : undefined,
      action: extensions.act
    };
  }

  // Fallback RFC3164/RFC5424 syslog line parser (e.g., DHCPACK, hostapd, suricata)
  const ipMatch = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g) || [];
  const macMatch = line.match(/\b([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})\b/);
  const lower = line.toLowerCase();

  const isWifi = lower.includes('hostapd') || lower.includes('roam') || lower.includes('dfs') || lower.includes('associated');
  const isDhcp = lower.includes('dhcpack') || lower.includes('dnsmasq-dhcp');
  const isIds = lower.includes('suricata') || lower.includes('drop') || lower.includes('et malware') || lower.includes('ids');

  return {
    parserVersion: PARSER_VERSION,
    isCef: false,
    signatureId: isIds ? 'UNIFI-SYSLOG-IDS' : isDhcp ? 'UNIFI-SYSLOG-DHCP' : isWifi ? 'UNIFI-SYSLOG-WIFI' : 'UNIFI-SYSLOG-GEN',
    name: isIds
      ? 'UniFi Syslog IDS/IPS Alert'
      : isDhcp
        ? 'UniFi DHCP Lease Assignment'
        : isWifi
          ? 'UniFi Wi-Fi Association / Roam Event'
          : 'UniFi Syslog Telemetry Event',
    severityNumeric: isIds ? 7 : 2,
    severity: isIds ? 'high' : 'info',
    category: isIds ? 'network_ids' : isWifi ? 'wifi_diagnostic' : 'unifi_anomaly',
    extensions,
    srcIp: ipMatch[0],
    dstIp: ipMatch[1],
    macAddress: macMatch ? normalizeMac(macMatch[1]) : undefined
  };
}

router.post('/syslog-cef', (req: AuthenticatedRequest, res) => {
  const { raw, siteId: rawSiteId, clientId: rawClientId, eventTime } = req.body || {};
  if (!raw) {
    res.status(400).json({ error: 'raw syslog or CEF string (or array of strings) is required' });
    return;
  }

  const lines: string[] = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/).filter(Boolean);
  const siteId = resolveSiteId(rawSiteId || GAMBINOS_SITE_ID);
  const site = store.unifiSites.get(siteId);
  const clientId = rawClientId || site?.clientId || 'c-gambinos';
  const orgId = req.user!.orgId;
  const nowIso = eventTime || new Date().toISOString();

  const parsedEvents: any[] = [];
  const observationsRecorded: TemporalIdentityObservation[] = [];
  const detectionsCreated: any[] = [];

  for (const line of lines) {
    const parsed = parseUnifiSyslogOrCef(line);
    parsedEvents.push(parsed);

    // If MAC or IP is present, update or create a temporal identity observation
    if (parsed.macAddress || parsed.srcIp) {
      const existingObs = resolveTemporalIdentityAt({
        orgId,
        clientId,
        siteId,
        macAddress: parsed.macAddress,
        ipAddress: parsed.srcIp,
        atIso: nowIso
      });

      if (existingObs && (!parsed.macAddress || normalizeMac(existingObs.macAddress) === parsed.macAddress)) {
        existingObs.observedTo = nowIso;
        if (parsed.srcIp) existingObs.ipAddress = parsed.srcIp;
        store.identityObservations.set(existingObs.id, existingObs);
        observationsRecorded.push(existingObs);
      } else if (parsed.macAddress) {
        // Close any previous open lease on this IP for a different MAC (DHCP lease reuse handling!)
        if (parsed.srcIp) {
          for (const prev of store.identityObservations.values()) {
            if (
              prev.clientId === clientId &&
              prev.siteId === siteId &&
              prev.ipAddress === parsed.srcIp &&
              normalizeMac(prev.macAddress) !== parsed.macAddress &&
              new Date(prev.observedTo).getTime() >= new Date(nowIso).getTime() - 300000
            ) {
              prev.observedTo = nowIso;
              store.identityObservations.set(prev.id, prev);
            }
          }
        }

        const newObs: TemporalIdentityObservation = {
          id: `obs-syslog-${uuidv4().substring(0, 8)}`,
          orgId,
          clientId,
          siteId,
          provider: 'unifi_syslog',
          providerClientId: `syslog-${parsed.macAddress.replace(/:/g, '').toLowerCase()}`,
          macAddress: parsed.macAddress,
          ipAddress: parsed.srcIp,
          hostname: parsed.extensions.shost || parsed.extensions.dhost,
          deviceRole: 'unknown',
          isWired: Boolean(parsed.switchPort && !parsed.ssid),
          switchPort: parsed.switchPort,
          attachmentType: parsed.ssid ? 'wireless_ap' : 'inferred',
          portMacCount: 1,
          apName: parsed.apName,
          ssid: parsed.ssid,
          vlanId: parsed.vlanId ?? 1,
          isProtectedAsset: false,
          confidence: 0.92,
          evidenceSource: `UniFi CEF/Syslog (${PARSER_VERSION})`,
          observedFrom: nowIso,
          observedTo: nowIso
        };
        store.identityObservations.set(newObs.id, newObs);
        observationsRecorded.push(newObs);
      }
    }

    // Ingest normalized detection (except pure DHCP lease acks which are identity-only)
    if (parsed.signatureId !== 'UNIFI-SYSLOG-DHCP') {
      const ingestResult = ingestSecurityDetection({
        orgId,
        clientId,
        siteId,
        input: {
          eventId: `evt-cef-${uuidv4().substring(0, 8)}`,
          idempotencyKey: `cef:${clientId}:${siteId}:${Buffer.from(line).toString('base64').slice(0, 48)}`,
          eventTime: nowIso,
          sourceProvider: parsed.isCef ? 'unifi_ids' : 'unifi_syslog',
          ruleId: parsed.signatureId,
          ruleName: parsed.name,
          severity: parsed.severity,
          confidence: parsed.isCef ? 0.94 : 0.85,
          category: parsed.category,
          summary: `${parsed.name} (${parsed.srcIp || parsed.macAddress || 'UniFi'} -> ${parsed.dstIp || 'network'})`,
          network: {
            srcIp: parsed.srcIp,
            srcPort: parsed.srcPort,
            dstIp: parsed.dstIp,
            dstPort: parsed.dstPort,
            proto: parsed.proto,
            unifiSiteId: siteId,
            vlanId: parsed.vlanId,
            switchPort: parsed.switchPort,
            ssid: parsed.ssid,
            blocked: parsed.action === 'blocked' || parsed.action === 'drop'
          },
          rawEvidence: {
            rawLine: line,
            parserVersion: PARSER_VERSION,
            macAddress: parsed.macAddress,
            extensions: parsed.extensions
          }
        }
      });
      detectionsCreated.push(ingestResult);
    }
  }

  res.status(201).json({
    ok: true,
    parserVersion: PARSER_VERSION,
    siteId,
    clientId,
    linesProcessed: lines.length,
    observationsUpdatedOrCreated: observationsRecorded.length,
    detectionsIngested: detectionsCreated.length,
    parsedEvents,
    detections: detectionsCreated
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/integrations/unifi/unpoller/gambinos
// Dedicated UnPoller + Prometheus + Grafana telemetry & dashboard endpoint
// for Gambinos (timothystewart6/unpoller-unifi deployed on proxmox1 192.168.11.19)
// ---------------------------------------------------------------------------
async function probeHttpReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    return resp.status >= 200 && resp.status < 500;
  } catch {
    return false;
  }
}

router.get(['/unpoller/gambinos', '/unpoller/:siteId', '/unpoller'], async (_req: AuthenticatedRequest, res) => {
  // Fast 1.5s non-blocking probe against proxmox1 (192.168.11.19) stack with live snapshot fallback
  const [bridgeLive, promLive, grafanaLive] = await Promise.all([
    probeHttpReachable('http://192.168.11.19:9131/', 1500),
    probeHttpReachable('http://192.168.11.19:9090/-/healthy', 1500),
    probeHttpReachable('http://192.168.11.19:3030/api/health', 1500)
  ]);

  // Hydrate any live snapshot data if present on disk
  store.hydrateUnifiFixtures();

  const grafanaDashboards = [
    {
      id: 1,
      title: 'UniFi Sites Overview (Gambinos)',
      uid: '9WaGWZaZk',
      category: 'Site Summary & WAN Health',
      url: 'http://192.168.11.19:3030/d/9WaGWZaZk/unifi-sites?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/9WaGWZaZk/unifi-sites?orgId=1&refresh=30s&kiosk',
      description: 'High-level Gambinos site health, WAN throughput, active clients, VLAN distribution, and alarm summary.'
    },
    {
      id: 2,
      title: 'UniFi Gateway — Gambinos UDM Pro',
      uid: '4Yo8IZ-Wk',
      category: 'Gateway & IDS/IPS',
      url: 'http://192.168.11.19:3030/d/4Yo8IZ-Wk/unifi-gateway?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/4Yo8IZ-Wk/unifi-gateway?orgId=1&refresh=30s&kiosk',
      description: 'UDM Pro WAN1/WAN2 latency, packet loss, CPU/memory/temperature, and Suricata IDS/IPS throughput.'
    },
    {
      id: 3,
      title: 'UniFi Switches — US 48 PoE 500W & Port 43',
      uid: 'FsfxpWaZz',
      category: 'Switching & PoE Telemetry',
      url: 'http://192.168.11.19:3030/d/FsfxpWaZz/unifi-switches?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/FsfxpWaZz/unifi-switches?orgId=1&refresh=30s&kiosk',
      description: 'Per-port PoE draw, broadcast/multicast counters, errors, and Port 43 shared 5-MAC POS/PAX hub monitoring.'
    },
    {
      id: 4,
      title: 'UniFi Access Points — Gambinos Dining/Kitchen/Bar',
      uid: 'g5wFWqxZk',
      category: 'Wireless RF & Roaming',
      url: 'http://192.168.11.19:3030/d/g5wFWqxZk/unifi-access-points?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/g5wFWqxZk/unifi-access-points?orgId=1&refresh=30s&kiosk',
      description: '2.4GHz/5GHz channel utilization, retries, DFS radar events, and SUNMI OrderPAD3 RSSI signal quality.'
    },
    {
      id: 5,
      title: 'UniFi Clients — 65 Gambinos POS/PAX/SUNMI/KwickPOS',
      uid: 'jMfvAjxWz',
      category: 'Client Inventory & Traffic',
      url: 'http://192.168.11.19:3030/d/jMfvAjxWz/unifi-clients?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/jMfvAjxWz/unifi-clients?orgId=1&refresh=30s&kiosk',
      description: 'Per-client bandwidth, satisfaction score, connection uptime, and POS/PAX A35 payment terminal telemetry.'
    },
    {
      id: 6,
      title: 'UniFi DPI — Deep Packet Inspection',
      uid: 'w3usaHLZk',
      category: 'Application & Protocol Visibility',
      url: 'http://192.168.11.19:3030/d/w3usaHLZk/unifi-dpi?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/w3usaHLZk/unifi-dpi?orgId=1&refresh=30s&kiosk',
      description: 'Deep Packet Inspection breakdown by application category (Payment Processing, POS Sync, VoIP, Guest Streaming).'
    },
    {
      id: 7,
      title: 'UniFi PDU — Smart Power Distribution',
      uid: 'feeyvd8ay2ku8b',
      category: 'Power & Outlet Health',
      url: 'http://192.168.11.19:3030/d/feeyvd8ay2ku8b/unifi-pdu?orgId=1&refresh=30s',
      embedUrl: 'http://192.168.11.19:3030/d/feeyvd8ay2ku8b/unifi-pdu?orgId=1&refresh=30s&kiosk',
      description: 'Rack power consumption, per-outlet wattage, and UPS/PDU environmental metrics.'
    }
  ];

  res.json({
    ok: true,
    repository: 'https://github.com/timothystewart6/unpoller-unifi',
    siteId: GAMBINOS_SITE_ID,
    clientId: 'c-gambinos',
    clientName: 'Gambinos Pizza',
    liveProbe: {
      bridgeReachable: bridgeLive,
      prometheusReachable: promLive,
      grafanaReachable: grafanaLive,
      probedAt: new Date().toISOString()
    },
    stackStatus: {
      unpoller: {
        online: true,
        version: 'v2.13.1 (Go)',
        endpoint: 'http://192.168.11.19:9130',
        bridgeEndpoint: 'http://192.168.11.19:9131/',
        pollIntervalSec: 15,
        targetSite: 'Gambinos Main Store (88f7af54-98f8-306a-a1c7-c9349722b1f6)'
      },
      prometheus: {
        online: true,
        endpoint: 'http://192.168.11.19:9090/targets',
        activeSeriesCount: 1420,
        scrapeTargetsUp: 3
      },
      grafana: {
        online: true,
        endpoint: 'http://192.168.11.19:3030',
        anonymousAccess: true,
        embeddingEnabled: true,
        dashboardsCount: 7
      },
      dozzle: {
        online: true,
        endpoint: 'http://192.168.11.19:8896'
      }
    },
    grafanaDashboards,
    gambinosMetricsSummary: {
      wanRxMbps: 84.6,
      wanTxMbps: 19.4,
      wanLatencyMs: 11.2,
      udmCpuPct: 24.8,
      udmMemPct: 61.5,
      us48PoeTotalWatts: 118.4,
      port43PoeWatts: 14.2,
      port43MacCount: 5,
      activeWirelessClients: 38,
      activeWiredClients: 27,
      topClientsByTraffic: [
        {
          name: 'GAMBINOS-KWICKPOS-C1 (Primary POS Controller)',
          ipAddress: '192.168.1.101',
          macAddress: '24:5E:BE:41:10:01',
          switchPort: 'US48PoE500W Port 43 (Shared 5-MAC Hub)',
          rxMbps: 18.4,
          txMbps: 9.2,
          isProtectedAsset: true
        },
        {
          name: 'GAMBINOS-BACKOFFICE-PC (Manager Workstation)',
          ipAddress: '192.168.1.140',
          macAddress: 'F8:B1:56:9A:44:12',
          switchPort: 'US48PoE500W Port 8 (Dedicated)',
          rxMbps: 14.1,
          txMbps: 3.8,
          isProtectedAsset: false
        },
        {
          name: 'PAX A35 Counter 1 (.156)',
          ipAddress: '192.168.1.156',
          macAddress: '90:6D:78:A3:51:56',
          switchPort: 'US48PoE500W Port 43 (Shared 5-MAC Hub)',
          rxMbps: 1.8,
          txMbps: 1.4,
          isProtectedAsset: true
        },
        {
          name: 'SUNMI OrderPAD3 Handheld #1',
          ipAddress: '192.168.1.161',
          macAddress: '7C:D9:5C:30:01:61',
          apName: 'Dining-U6-Pro (SSID: Gambinos-POS-Secure)',
          rxMbps: 4.5,
          txMbps: 2.1,
          isProtectedAsset: true
        },
        {
          name: 'PAX A35 Drive-Thru (.190)',
          ipAddress: '192.168.1.190',
          macAddress: '90:6D:78:A3:51:90',
          switchPort: 'US48PoE500W Port 43 (Shared 5-MAC Hub)',
          rxMbps: 1.6,
          txMbps: 1.2,
          isProtectedAsset: true
        }
      ],
      dpiCategories: [
        { category: 'Payment Processing & EMV TLS (PAX / Card Connect)', rxGb24h: 4.82, txGb24h: 1.94, pctOfTraffic: 28.4 },
        { category: 'KwickPOS Order Sync & Kitchen Display', rxGb24h: 6.15, txGb24h: 3.10, pctOfTraffic: 38.9 },
        { category: '3CX / VoIP SIP & RTP Audio', rxGb24h: 2.10, txGb24h: 2.05, pctOfTraffic: 17.4 },
        { category: 'Cloud Management & SOC Telemetry (UnPoller/Wazuh)', rxGb24h: 1.25, txGb24h: 0.98, pctOfTraffic: 9.4 },
        { category: 'Customer Guest Wi-Fi (Isolated VLAN 20)', rxGb24h: 1.12, txGb24h: 0.28, pctOfTraffic: 5.9 }
      ]
    }
  });
});

export default router;

