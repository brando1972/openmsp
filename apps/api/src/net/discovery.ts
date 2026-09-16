import { store } from '../db/store.js';
import type {
  CollectorCandidacy,
  NetScanConfig,
  NetworkScanResult,
  DiscoveredHost,
  DiscoveredNeighbor
} from '@openmsp/api-types';

/**
 * Network discovery control plane.
 * ---------------------------------------------------------------------------
 * Owns three things, all keyed by siteId:
 *   1. Collector election — picks ONE agent per site to run LAN scans, with a
 *      lease so the role survives brief heartbeat gaps and fails over when the
 *      holder goes quiet.
 *   2. Per-site scan config (enable, cadence, SNMP creds) — persisted via the
 *      store so it survives restarts. SNMP secrets live here server-side only.
 *   3. The discovered inventory + topology edges reported by collectors — held
 *      in memory (repopulated every scan interval; cheap to lose on restart).
 */

const DEFAULT_LEASE_SECONDS = 90; // ~3 heartbeats at 30s

// ---- collector election ------------------------------------------------------

interface Candidate extends CollectorCandidacy {
  deviceId: string;
  ts: number; // last heartbeat (ms)
}
interface Lease {
  deviceId: string;
  expires: number;
}

const candidates = new Map<string, Map<string, Candidate>>(); // siteId → deviceId → candidate
const leases = new Map<string, Lease>(); // siteId → current collector lease

function siteCandidates(siteId: string): Map<string, Candidate> {
  let m = candidates.get(siteId);
  if (!m) {
    m = new Map();
    candidates.set(siteId, m);
  }
  return m;
}

function scoreCandidate(c: Candidate): number[] {
  // Higher tuple sorts first: raw-scan capable, longer uptime, wired, sticky.
  return [c.canRawScan ? 1 : 0, c.uptimeDays || 0, c.wired ? 1 : 0, c.isCollector ? 1 : 0];
}
function betterThan(a: Candidate, b: Candidate): boolean {
  const sa = scoreCandidate(a);
  const sb = scoreCandidate(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i];
  }
  return a.deviceId < b.deviceId; // stable tie-break
}

/**
 * Record this device's candidacy and return whether it currently holds the
 * collector role for its site. Called on every heartbeat.
 */
export function electCollector(
  siteId: string,
  deviceId: string,
  cand: CollectorCandidacy,
  leaseSeconds = DEFAULT_LEASE_SECONDS
): boolean {
  if (!siteId) siteId = '_default';
  const now = Date.now();
  const site = siteCandidates(siteId);
  site.set(deviceId, { ...cand, deviceId, ts: now });

  // Drop stale candidates (missed > 2 leases).
  for (const [id, c] of site) {
    if (now - c.ts > leaseSeconds * 2 * 1000) site.delete(id);
  }

  let lease = leases.get(siteId);
  let holderFresh = false;
  if (lease && lease.expires > now) {
    const hc = site.get(lease.deviceId);
    holderFresh = !!hc && now - hc.ts <= leaseSeconds * 1000;
  }

  if (!holderFresh) {
    // Elect the best fresh candidate.
    let best: Candidate | null = null;
    for (const c of site.values()) {
      if (now - c.ts > leaseSeconds * 1000) continue; // must be fresh
      if (!best || betterThan(c, best)) best = c;
    }
    if (best) {
      lease = { deviceId: best.deviceId, expires: now + leaseSeconds * 1000 };
      leases.set(siteId, lease);
    }
  } else if (lease) {
    lease.expires = now + leaseSeconds * 1000; // renew
  }

  return !!lease && lease.deviceId === deviceId;
}

export function collectorFor(siteId: string): string | null {
  const lease = leases.get(siteId || '_default');
  return lease && lease.expires > Date.now() ? lease.deviceId : null;
}

// ---- per-site scan config (persisted) ---------------------------------------

/** Returns the scan config the collector should act on, or null if disabled. */
export function scanConfigFor(siteId: string): NetScanConfig | null {
  const key = siteId || '_default';
  const cfg = store.netScan.get(key);
  if (cfg && cfg.enabled === false) return null;
  // Default-on so discovery works out of the box; SNMP empty until creds set.
  return {
    enabled: true,
    prefixes: cfg?.prefixes,
    fullIntervalMin: cfg?.fullIntervalMin ?? 30,
    liveIntervalMin: cfg?.liveIntervalMin ?? 5,
    snmp: cfg?.snmp ?? [],
    scanNow: !!cfg?.scanNow
  };
}

export function setScanConfig(siteId: string, patch: Partial<NetScanConfig>): NetScanConfig {
  const key = siteId || '_default';
  const cur = store.netScan.get(key) || { enabled: true };
  const next: NetScanConfig = { ...cur, ...patch };
  store.netScan.set(key, next);
  store.persist();
  return next;
}

export function requestScanNow(siteId: string): void {
  setScanConfig(siteId, { scanNow: true });
}

// ---- discovered inventory (in memory) ---------------------------------------

export interface SiteInventory {
  siteId: string;
  orgId: string;
  clientId: string;
  prefixes: string[];
  hosts: DiscoveredHost[];
  neighbors: DiscoveredNeighbor[];
  collectorDeviceId: string;
  method: string;
  updatedAt: string;
}

const inventory = new Map<string, SiteInventory>(); // siteId → inventory

/** Ingest a scan reported by a collector; reconcile against managed devices. */
export function ingestScan(deviceId: string, result: NetworkScanResult): void {
  const reporter = store.devices.get(deviceId);
  const siteId = (result.siteId || reporter?.siteId || '_default') as string;
  const clientId = (reporter?.clientId as string) || '';
  const client = clientId ? store.clients.get(clientId) : undefined;
  const orgId = ((client as any)?.orgId as string) || Array.from(store.orgs.values())[0]?.id || '';

  // Reconcile: link a discovered host to a managed device by MAC or IP.
  const byMac = new Map<string, string>();
  const byIp = new Map<string, string>();
  for (const d of store.devices.values()) {
    if (d.macAddress) byMac.set(d.macAddress.toLowerCase(), d.id);
    if (d.ipAddress) byIp.set(d.ipAddress, d.id);
  }
  for (const h of result.hosts) {
    let managed: string | null = null;
    if (h.mac && byMac.has(h.mac.toLowerCase())) managed = byMac.get(h.mac.toLowerCase())!;
    if (!managed) {
      for (const ip of h.ips || []) {
        if (byIp.has(ip)) { managed = byIp.get(ip)!; break; }
      }
    }
    h.managedDeviceId = managed;
  }

  inventory.set(siteId, {
    siteId,
    orgId,
    clientId,
    prefixes: result.prefixes || [],
    hosts: result.hosts || [],
    neighbors: result.neighbors || [],
    collectorDeviceId: deviceId,
    method: result.method,
    updatedAt: new Date().toISOString()
  });

  // Consume a one-shot scan-now (full scan just delivered).
  if (result.method === 'full') {
    const cfg = store.netScan.get(siteId);
    if (cfg?.scanNow) { cfg.scanNow = false; store.netScan.set(siteId, cfg); store.persist(); }
  }
}

/** All site inventories visible to an org (tenant-scoped). */
export function inventoryForOrg(orgId: string): SiteInventory[] {
  const out: SiteInventory[] = [];
  for (const inv of inventory.values()) {
    if (!orgId || inv.orgId === orgId || inv.orgId === '') out.push(inv);
  }
  return out;
}

export function inventoryForSite(siteId: string): SiteInventory | null {
  return inventory.get(siteId || '_default') || null;
}

/** Topology graph for a site: nodes (hosts) + edges (neighbors, resolved to ids). */
export function topologyForSite(siteId: string): { nodes: DiscoveredHost[]; edges: DiscoveredNeighbor[] } {
  const inv = inventory.get(siteId || '_default');
  if (!inv) return { nodes: [], edges: [] };
  return { nodes: inv.hosts, edges: inv.neighbors };
}
