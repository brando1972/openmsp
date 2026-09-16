import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { store } from '../db/store.js';
import {
  registerCollectorChannel,
  unregisterCollectorChannel,
  validateSession,
  closeSessionById,
  type TunnelSession
} from './tunnel.js';

/**
 * On-LAN tunnel — data plane (WebSocket relay).
 * ---------------------------------------------------------------------------
 * Two socket roles meet here and the control plane relays bytes between them:
 *
 *   collector  ⇄  API (this module)  ⇄  browser
 *
 *   - /ws/v1/tunnel/collector : the elected site collector's persistent channel.
 *     Authenticates with {t:'hello', deviceId, secret}; the site is taken from
 *     the *device record*, never from the message. Carries every session for
 *     that site, multiplexed by session id.
 *   - /ws/v1/tunnel/session   : one browser terminal. Authenticated at upgrade
 *     by (sid, token) — the token minted in openSession(). The browser then
 *     sends {t:'auth', username, password|privateKey, cols, rows}; the creds are
 *     forwarded to the collector for that site and never stored or logged.
 *
 * Wire framing matches the Go collector: control = JSON text frames; payload =
 * binary frames of [2-byte big-endian sid length][sid][bytes].
 */

// A tagged WebSocket carrying the role state we attach on upgrade.
type CollectorWS = WebSocket & { _siteId?: string };
type ConsoleWS = WebSocket & { _sid?: string; _authed?: boolean };

const collectors = new Map<string, CollectorWS>();     // siteId → collector channel
const consoleBySid = new Map<string, ConsoleWS>();     // sid → browser terminal
const collectorBySid = new Map<string, CollectorWS>(); // sid → collector serving it

const wss = new WebSocketServer({ noServer: true });

// ---- binary framing (mirror of the Go encodeBin/decodeBin) -----------------
function encodeBin(sid: string, payload: Buffer): Buffer {
  const sidBuf = Buffer.from(sid, 'utf8');
  const out = Buffer.allocUnsafe(2 + sidBuf.length + payload.length);
  out.writeUInt16BE(sidBuf.length, 0);
  sidBuf.copy(out, 2);
  payload.copy(out, 2 + sidBuf.length);
  return out;
}
function decodeBin(buf: Buffer): { sid: string; payload: Buffer } | null {
  if (buf.length < 2) return null;
  const n = buf.readUInt16BE(0);
  if (buf.length < 2 + n) return null;
  return { sid: buf.slice(2, 2 + n).toString('utf8'), payload: buf.slice(2 + n) };
}

function sendJSON(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ---- upgrade routing -------------------------------------------------------
// Returns true if this module handled the upgrade for the given path.
export function handleTunnelUpgrade(
  pathname: string,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
): boolean {
  if (pathname === '/ws/v1/tunnel/collector') {
    wss.handleUpgrade(request, socket, head, (ws) => onCollector(ws as CollectorWS, request));
    return true;
  }
  if (pathname === '/ws/v1/tunnel/session') {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const sid = url.searchParams.get('sid') || '';
    const token = url.searchParams.get('token') || '';
    const session = validateSession(sid, token);
    if (!session || session.kind !== 'ssh') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return true;
    }
    wss.handleUpgrade(request, socket, head, (ws) => onConsole(ws as ConsoleWS, session));
    return true;
  }
  return false;
}

// ---- collector side --------------------------------------------------------
function onCollector(ws: CollectorWS, _req: IncomingMessage) {
  let authed = false;
  const authTimeout = setTimeout(() => { if (!authed) ws.close(); }, 10_000);

  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      if (!authed) return;
      const f = decodeBin(data);
      if (!f) return;
      const browser = consoleBySid.get(f.sid);
      if (browser && browser.readyState === WebSocket.OPEN) browser.send(f.payload);
      return;
    }
    let m: any;
    try { m = JSON.parse(data.toString()); } catch { return; }

    if (!authed) {
      if (m.t !== 'hello') return;
      const device: any = store.devices.get(m.deviceId);
      if (!device || (device.deviceSecret && device.deviceSecret !== m.secret)) {
        ws.close();
        return;
      }
      const siteId = device.siteId || '_default';
      authed = true;
      clearTimeout(authTimeout);
      ws._siteId = siteId;
      // Last collector wins (covers brief failover overlap).
      const prev = collectors.get(siteId);
      if (prev && prev !== ws) prev.close();
      collectors.set(siteId, ws);
      registerCollectorChannel(siteId, ws);
      console.log(`[tunnel] collector channel up for site ${siteId} (device ${m.deviceId})`);
      return;
    }

    // Authenticated control from collector → relay to the browser.
    const sid = m.sid;
    const browser = sid ? consoleBySid.get(sid) : undefined;
    switch (m.t) {
      case 'ready':
        if (browser) sendJSON(browser, { t: 'ready' });
        break;
      case 'error':
        if (browser) { sendJSON(browser, { t: 'error', msg: m.msg || 'session error' }); }
        cleanupSid(sid);
        break;
      case 'close':
        if (browser) { sendJSON(browser, { t: 'close' }); browser.close(); }
        cleanupSid(sid);
        break;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (ws._siteId && collectors.get(ws._siteId) === ws) {
      collectors.delete(ws._siteId);
      unregisterCollectorChannel(ws._siteId);
      console.log(`[tunnel] collector channel down for site ${ws._siteId}`);
    }
    // Drop every browser terminal this collector was serving.
    for (const [sid, col] of collectorBySid) {
      if (col === ws) {
        const b = consoleBySid.get(sid);
        if (b) { sendJSON(b, { t: 'close', msg: 'collector disconnected' }); b.close(); }
        cleanupSid(sid);
      }
    }
  });

  ws.on('error', () => { /* close handler does teardown */ });
}

// ---- browser side ----------------------------------------------------------
function onConsole(ws: ConsoleWS, session: TunnelSession) {
  const sid = session.id;
  ws._sid = sid;

  // Only one live terminal per session.
  const existing = consoleBySid.get(sid);
  if (existing && existing !== ws) existing.close();

  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      if (!ws._authed) return;
      const col = collectorBySid.get(sid);
      if (col && col.readyState === WebSocket.OPEN) col.send(encodeBin(sid, data));
      return;
    }
    let m: any;
    try { m = JSON.parse(data.toString()); } catch { return; }

    if (m.t === 'auth') {
      if (ws._authed) return;
      const col = collectors.get(session.siteId);
      if (!col || col.readyState !== WebSocket.OPEN) {
        sendJSON(ws, { t: 'error', msg: 'Site collector is offline.' });
        ws.close();
        return;
      }
      ws._authed = true;
      consoleBySid.set(sid, ws);
      collectorBySid.set(sid, col);
      // Forward the open + credentials to the collector. Never logged.
      col.send(JSON.stringify({
        t: 'open',
        sid,
        kind: 'ssh',
        host: session.ip,
        port: session.port,
        cols: clampDim(m.cols, 80),
        rows: clampDim(m.rows, 24),
        auth: {
          username: String(m.username || ''),
          password: m.password ? String(m.password) : undefined,
          privateKey: m.privateKey ? String(m.privateKey) : undefined,
          passphrase: m.passphrase ? String(m.passphrase) : undefined
        }
      }));
      return;
    }

    if (m.t === 'resize') {
      const col = collectorBySid.get(sid);
      if (col && col.readyState === WebSocket.OPEN) {
        col.send(JSON.stringify({ t: 'resize', sid, cols: clampDim(m.cols, 80), rows: clampDim(m.rows, 24) }));
      }
    }
  });

  ws.on('close', () => {
    const col = collectorBySid.get(sid);
    if (col && col.readyState === WebSocket.OPEN) col.send(JSON.stringify({ t: 'close', sid }));
    cleanupSid(sid);
  });

  ws.on('error', () => { /* close handler does teardown */ });
}

function clampDim(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

function cleanupSid(sid: string) {
  if (!sid) return;
  consoleBySid.delete(sid);
  collectorBySid.delete(sid);
  closeSessionById(sid);
}
