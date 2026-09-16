import { randomBytes } from 'crypto';
import { collectorFor, inventoryForSite } from './discovery.js';

/**
 * On-LAN tunnel — session broker (control plane).
 * ---------------------------------------------------------------------------
 * A technician opens a discovered device's web UI or an SSH session; the bytes
 * ride through the site collector's outbound connection, so nothing at the
 * client site needs an open port. This module owns the SESSION lifecycle:
 * validating the target, minting a short-lived session, and pointing the browser
 * at the broker entrypoint.
 *
 * The DATA PLANE — the collector's persistent WSS to the broker and the per-
 * session byte piping — registers its live collector channels through
 * `registerCollectorChannel()`. Until a collector channel is present for a site,
 * `openSession()` returns `ready:false` and the console shows a graceful
 * "collector must be online" message instead of a dead tunnel.
 *
 * Security invariants:
 *   - The target must be a device DISCOVERED at that site (SSRF guard) — the
 *     browser can never ask the collector to reach an arbitrary address.
 *   - Sessions are single-purpose, time-boxed, and audited by the caller.
 *   - Only web ports (80/443/8080/8443) and SSH (22, or an explicit port) are
 *     brokered in v1.
 */

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const WEB_PORTS = new Set([80, 443, 8080, 8443, 8000]);

export interface TunnelSession {
  id: string;
  token: string;      // bearer for the data-plane socket (never in audit/logs)
  siteId: string;
  kind: 'web' | 'ssh';
  ip: string;
  port: number;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, TunnelSession>();

// Live collector data-plane channels, registered by the WSS layer when a
// collector dials in. siteId → opaque channel handle (the ws layer owns it).
const collectorChannels = new Map<string, unknown>();

export function registerCollectorChannel(siteId: string, channel: unknown): void {
  collectorChannels.set(siteId || '_default', channel);
}
export function unregisterCollectorChannel(siteId: string): void {
  collectorChannels.delete(siteId || '_default');
}
export function hasCollectorChannel(siteId: string): boolean {
  return collectorChannels.has(siteId || '_default');
}

// SSRF guard: the target must be a discovered host at this site.
function isKnownTarget(siteId: string, ip: string): boolean {
  const inv = inventoryForSite(siteId);
  if (!inv) return false;
  return inv.hosts.some((h) => (h.ips || []).includes(ip));
}

export interface OpenResult {
  ok: boolean;
  ready: boolean;      // a collector data-channel is live for this site
  url: string;         // web entrypoint (http reverse-proxy; empty for ssh / not-ready)
  wsUrl?: string;      // ssh data-plane socket (ws(s); empty until data plane is live)
  token?: string;      // bearer the browser presents on the data-plane socket
  kind?: 'web' | 'ssh';
  sessionId?: string;
  reason?: string;
}

/**
 * Create a tunnel session to ip:port at a site. `publicBase` is the browser-
 * facing origin the entrypoint is built from (e.g. https://api.apexmsp.app).
 */
export function openSession(opts: {
  siteId: string;
  kind: 'web' | 'ssh';
  ip: string;
  port: number;
  publicBase: string;
}): OpenResult {
  const siteId = opts.siteId || '_default';

  if (!collectorFor(siteId)) {
    return { ok: false, ready: false, url: '', reason: 'No site collector is currently online.' };
  }
  if (!isKnownTarget(siteId, opts.ip)) {
    return { ok: false, ready: false, url: '', reason: 'Target is not a discovered device at this site.' };
  }
  if (opts.kind === 'web' && !WEB_PORTS.has(opts.port)) {
    return { ok: false, ready: false, url: '', reason: `Port ${opts.port} is not a permitted web port.` };
  }

  const id = randomBytes(18).toString('base64url');
  const token = randomBytes(24).toString('base64url');
  const now = Date.now();
  const session: TunnelSession = {
    id, token, siteId, kind: opts.kind, ip: opts.ip,
    port: opts.kind === 'ssh' ? (opts.port || 22) : opts.port,
    createdAt: now, expiresAt: now + SESSION_TTL_MS
  };
  sessions.set(id, session);
  sweep();

  // The data plane pipes bytes only once a collector channel is live. Until
  // then the session exists but has no entrypoint — the console degrades to a
  // clear "collector must be online" message rather than a broken tab.
  const ready = hasCollectorChannel(siteId);
  const base = (opts.publicBase || '').replace(/\/+$/, '');
  const wsBase = base.replace(/^http/, 'ws'); // http→ws, https→wss

  let url = '';
  let wsUrl: string | undefined;
  if (ready) {
    if (opts.kind === 'web') {
      url = `${base}/api/v1/net/tunnel/web/${id}/`;
    } else {
      wsUrl = `${wsBase}/ws/v1/tunnel/session?sid=${id}&token=${token}`;
    }
  }

  return {
    ok: ready, ready, url, wsUrl,
    token: ready ? token : undefined,
    kind: opts.kind, sessionId: id,
    reason: ready ? undefined : 'Tunnel data plane not yet active for this site.'
  };
}

export function getSession(id: string): TunnelSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { sessions.delete(id); return null; }
  return s;
}

// validateSession returns the live session iff the token matches — the browser
// presents this on the data-plane socket. Constant-ish comparison is fine here
// (tokens are 192-bit random and single-use per short-lived session).
export function validateSession(id: string, token: string): TunnelSession | null {
  const s = getSession(id);
  if (!s || !token || s.token !== token) return null;
  return s;
}

export function closeSessionById(id: string): void {
  sessions.delete(id);
}

function sweep(): void {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id);
}
