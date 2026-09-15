import { WebSocket } from 'ws';
import sharp from 'sharp';

/**
 * MeshCentral control-channel client (headless, server-side).
 * ---------------------------------------------------------------------------
 * Powers the NATIVE ApexConnect remote desktop. The browser never talks to
 * MeshCentral's admin UI — it opens only a raw meshrelay WebSocket and speaks
 * the KVM protocol directly (see apps/console .../ApexConnectDesktop.tsx).
 *
 * This module holds the one privileged piece that must stay server-side:
 * an authenticated MeshCentral control channel. It is used to (a) mint a
 * short-lived relay auth cookie for the browser and (b) instruct the target
 * agent to open its side of the relay tunnel. No MeshCentral credential ever
 * reaches the browser.
 *
 * Auth uses the same headless mechanism as the official `meshctrl` CLI:
 *   header  x-meshauth: base64(user),base64(pass)[,base64(2fa)]
 *
 * Env (populated server-side on the control plane, never in git/logs):
 *   MESH_URL   control-plane URL of the MeshCentral server (default mesh.apexmsp.app)
 *   MESH_USER  service-account username (needs access to the device group)
 *   MESH_PASS  service-account password
 *   MESH_TOTP  optional TOTP 2FA token (if the account enforces it)
 */

export interface MeshNode {
  nodeid: string;
  name: string;
  rname: string;
  host: string;
  meshid: string;
  online: boolean;
}

interface AuthCookie {
  cookie: string;
  rcookie: string;
}

export interface MeshTelemetry {
  os: string;
  cpu: string;
  ramGB: number | null;
  ramUsedPct: number | null;
  diskPct: number | null;
  diskTotalGB: number | null;
  model: string;
  serial: string;
}

// Normalize a MeshCentral sysinfo doc into card telemetry.
function parseTelemetry(si: any): MeshTelemetry {
  const hw = si?.hardware || {};
  const id = hw.identifiers || {};
  const win = hw.windows || {};
  const t: MeshTelemetry = { os: '', cpu: '', ramGB: null, ramUsedPct: null, diskPct: null, diskTotalGB: null, model: '', serial: '' };

  t.cpu = id.cpu_name || (Array.isArray(win.cpu) && win.cpu[0] && win.cpu[0].Name) || '';
  t.serial = id.board_serial || id.bios_serial || '';
  t.model = [id.board_vendor || id.bios_vendor || '', id.product_name || id.board_name || ''].filter(Boolean).join(' ').trim();

  if (win.osinfo && win.osinfo.Caption) t.os = String(win.osinfo.Caption).replace(/^Microsoft\s+/, '');

  // RAM: sum physical memory sticks; usage from OS snapshot if present.
  if (Array.isArray(win.memory)) {
    let bytes = 0;
    for (const m of win.memory) { const c = parseInt(m.Capacity, 10); if (Number.isFinite(c)) bytes += c; }
    if (bytes > 0) t.ramGB = Math.round(bytes / 1073741824);
  }
  if (win.osinfo && win.osinfo.TotalVisibleMemorySize && win.osinfo.FreePhysicalMemory) {
    const total = parseInt(win.osinfo.TotalVisibleMemorySize, 10);
    const free = parseInt(win.osinfo.FreePhysicalMemory, 10);
    if (total > 0 && free >= 0) t.ramUsedPct = Math.round(((total - free) / total) * 100);
    if (!t.ramGB && total > 0) t.ramGB = Math.round(total / 1048576); // KB → GB
  }

  // Disk: sum fixed volumes (dType 3 = local disk).
  if (win.volumes && typeof win.volumes === 'object') {
    let size = 0, free = 0;
    for (const v of Object.values<any>(win.volumes)) {
      if (v && typeof v.size === 'number' && typeof v.sizeremaining === 'number' && (v.dType == null || v.dType === 3)) {
        size += v.size; free += v.sizeremaining;
      }
    }
    if (size > 0) { t.diskPct = Math.round(((size - free) / size) * 100); t.diskTotalGB = Math.round(size / 1073741824); }
  } else if (Array.isArray(id.storage_devices) && id.storage_devices[0] && id.storage_devices[0].Size) {
    const m = String(id.storage_devices[0].Size).match(/([\d.]+)\s*GB/i);
    if (m) t.diskTotalGB = Math.round(parseFloat(m[1]));
  }
  return t;
}

const MESH_URL = (process.env.MESH_URL || 'https://mesh.apexmsp.app').replace(/\/+$/, '');
const MESH_USER = process.env.MESH_USER || '';
const MESH_PASS = process.env.MESH_PASS || '';
const MESH_TOTP = process.env.MESH_TOTP || '';

function controlUrl(): string {
  return MESH_URL.replace(/^http/, 'ws') + '/control.ashx';
}
function relayBase(): string {
  // browser-facing wss origin for the meshrelay endpoint
  return MESH_URL.replace(/^http/, 'ws') + '/meshrelay.ashx';
}
function b64(s: string): string {
  return Buffer.from('' + s).toString('base64');
}

class MeshClient {
  private ws: WebSocket | null = null;
  private connecting = false;
  private authed = false;
  private readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  private cookieWaiters: Array<(c: AuthCookie) => void> = [];
  private nodes = new Map<string, MeshNode>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastError = '';

  public configured(): boolean {
    return !!(MESH_USER && MESH_PASS);
  }

  public status() {
    return {
      configured: this.configured(),
      connected: this.authed,
      nodeCount: this.nodes.size,
      lastError: this.lastError,
      server: MESH_URL
    };
  }

  public listNodes(): MeshNode[] {
    return Array.from(this.nodes.values());
  }

  /** Connect (if needed) and resolve once the control channel is authenticated. */
  public ensureReady(timeoutMs = 12000): Promise<void> {
    if (!this.configured()) {
      return Promise.reject(new Error('MeshCentral service account not configured (MESH_USER/MESH_PASS)'));
    }
    if (this.authed && this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();

    const p = new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
      const t = setTimeout(() => {
        const i = this.readyWaiters.findIndex((w) => w.reject === reject);
        if (i >= 0) this.readyWaiters.splice(i, 1);
        reject(new Error('MeshCentral control channel not ready (timeout)'));
      }, timeoutMs);
      // clear the timer when settled
      const wrap = this.readyWaiters[this.readyWaiters.length - 1];
      wrap.resolve = () => { clearTimeout(t); resolve(); };
      wrap.reject = (e: Error) => { clearTimeout(t); reject(e); };
    });
    this.connect();
    return p;
  }

  private connect(): void {
    if (this.connecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    this.connecting = true;
    let token = '';
    if (MESH_TOTP) token = ',' + b64(MESH_TOTP);
    const headers = { 'x-meshauth': b64(MESH_USER) + ',' + b64(MESH_PASS) + token };

    let ws: WebSocket;
    try {
      ws = new WebSocket(controlUrl(), { headers });
    } catch (e) {
      this.connecting = false;
      this.fail(e instanceof Error ? e.message : 'connect failed');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.connecting = false;
      // Ask the server for the device list; auth is confirmed via serverinfo below.
      this.safeSend({ action: 'meshes' });
      this.safeSend({ action: 'nodes' });
    });

    ws.on('message', (data: Buffer | string) => this.onMessage(data.toString()));

    ws.on('close', (code: number) => {
      this.authed = false;
      this.connecting = false;
      if (code === 401 || code === 403) this.fail('authentication rejected (check MESH_USER/MESH_PASS)');
      this.scheduleReconnect();
    });

    ws.on('error', (e: Error) => {
      this.lastError = e.message;
      this.connecting = false;
    });
  }

  private onMessage(text: string): void {
    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg.action !== 'string') return;

    switch (msg.action) {
      case 'serverinfo':
      case 'userinfo': {
        // Receiving these means the control channel is authenticated.
        if (!this.authed) {
          this.authed = true;
          this.lastError = '';
          const waiters = this.readyWaiters.splice(0);
          for (const w of waiters) w.resolve();
        }
        break;
      }
      case 'nodes': {
        this.ingestNodes(msg.nodes);
        break;
      }
      case 'authcookie': {
        const cb = this.cookieWaiters.shift();
        if (cb) cb({ cookie: msg.cookie || '', rcookie: msg.rcookie || '' });
        break;
      }
      case 'getsysinfo': {
        const cb = msg.tag && this.sysinfoWaiters.get(msg.tag);
        if (cb) { this.sysinfoWaiters.delete(msg.tag); cb(msg); }
        break;
      }
      case 'close': {
        if (msg.cause) this.fail('server closed control channel: ' + msg.cause);
        break;
      }
      default:
        break;
    }
  }

  // ---- device telemetry (hardware inventory from the MeshCentral agent) ----
  private sysinfoWaiters = new Map<string, (m: any) => void>();
  private telemetryCache = new Map<string, { data: MeshTelemetry | null; ts: number }>();

  public async getTelemetry(nodeid: string, maxAgeMs = 600000): Promise<MeshTelemetry | null> {
    const cached = this.telemetryCache.get(nodeid);
    if (cached && Date.now() - cached.ts < maxAgeMs) return cached.data;
    let data: MeshTelemetry | null = null;
    try {
      await this.ensureReady();
      const raw = await this.requestSysInfo(nodeid);
      data = raw ? parseTelemetry(raw) : null;
    } catch { data = cached ? cached.data : null; }
    this.telemetryCache.set(nodeid, { data, ts: Date.now() });
    return data;
  }

  private requestSysInfo(nodeid: string, timeoutMs = 8000): Promise<any | null> {
    return new Promise((resolve) => {
      const tag = 'apex-si-' + Math.random().toString(36).slice(2);
      const t = setTimeout(() => { this.sysinfoWaiters.delete(tag); resolve(null); }, timeoutMs);
      this.sysinfoWaiters.set(tag, (m) => { clearTimeout(t); resolve(m && m.noinfo ? null : m); });
      this.safeSend({ action: 'getsysinfo', nodeid, tag, nodeinfo: false });
    });
  }

  private ingestNodes(nodes: any): void {
    if (!nodes || typeof nodes !== 'object') return;
    // Shape: { 'mesh//..': [ {_id, name, rname, host, conn, ...}, ... ], ... }
    for (const meshid of Object.keys(nodes)) {
      const list = nodes[meshid];
      if (!Array.isArray(list)) continue;
      for (const n of list) {
        if (!n || !n._id) continue;
        this.nodes.set(n._id, {
          nodeid: n._id,
          name: n.name || '',
          rname: n.rname || '',
          host: n.host || '',
          meshid: n.meshid || meshid,
          online: (n.conn || 0) !== 0
        });
      }
    }
  }

  private safeSend(obj: unknown): void {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  private fail(m: string): void {
    this.lastError = m;
    const waiters = this.readyWaiters.splice(0);
    for (const w of waiters) w.reject(new Error(m));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.configured()) this.connect();
    }, 5000);
  }

  /** Resolve a MeshCentral node by matching hostname/name candidates (case-insensitive). */
  public resolveNode(candidates: string[]): MeshNode | null {
    const wants = candidates.map((c) => (c || '').trim().toLowerCase()).filter(Boolean);
    if (wants.length === 0) return null;
    for (const node of this.nodes.values()) {
      const names = [node.name, node.rname].map((s) => s.toLowerCase());
      // also compare against the bare hostname (strip .local etc.)
      const bare = names.map((s) => s.split('.')[0]);
      if (wants.some((w) => names.includes(w) || bare.includes(w.split('.')[0]))) return node;
    }
    return null;
  }

  public getNode(nodeid: string): MeshNode | null {
    return this.nodes.get(nodeid) || null;
  }

  /**
   * Run a shell command / script on a node through MeshCentral. The Mesh agent
   * runs as SYSTEM (Windows) / root (macOS/Linux), so this is the channel used
   * to repair a sibling agent (e.g. restart the RMM agent) when the RMM channel
   * itself is down. Fire-and-forget over the control channel.
   *
   * shell: 'ps'   -> Windows PowerShell   (MeshCentral runcommands type 2)
   *        'bat'  -> Windows cmd.exe       (type 1)
   *        'bash' -> macOS/Linux /bin/sh   (type 0)
   * NOTE: the MeshCentral runcommands type enum and the agent's dispatch are
   * validated against a LIVE agent - this path is exercised only when a node is
   * online but its sibling agent is down. runAsUser 0 = run as the agent user.
   */
  public async runCommand(nodeid: string, cmds: string, shell: 'ps' | 'bat' | 'bash' = 'bash', runAsUser = 0): Promise<void> {
    await this.ensureReady();
    const type = shell === 'bat' ? 1 : shell === 'ps' ? 2 : 0;
    this.safeSend({ action: 'runcommands', nodeids: [nodeid], type, cmds, runAsUser, reqid: 'apex-heal-' + Math.random().toString(36).slice(2) });
  }

  private mintAuthCookie(timeoutMs = 8000): Promise<AuthCookie> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const i = this.cookieWaiters.indexOf(resolver);
        if (i >= 0) this.cookieWaiters.splice(i, 1);
        reject(new Error('authcookie timeout'));
      }, timeoutMs);
      const resolver = (c: AuthCookie) => { clearTimeout(t); resolve(c); };
      this.cookieWaiters.push(resolver);
      this.safeSend({ action: 'authcookie' });
    });
  }

  /**
   * Open a desktop (or other) relay to a node. Mints a browser auth cookie and
   * tells the agent to connect its relay side. Returns everything the browser
   * needs to open the meshrelay WebSocket and speak the protocol directly.
   */
  public async openDesktopSession(nodeid: string, protocol = 2): Promise<{
    relayUrl: string;
    nodeid: string;
    tunnelid: string;
    auth: string;
    protocol: number;
  }> {
    await this.ensureReady();
    const { cookie, rcookie } = await this.mintAuthCookie();
    const tunnelid = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    // Instruct the agent (via the server) to open its relay side with the matching id.
    let value = '*/meshrelay.ashx?p=' + protocol + '&nodeid=' + nodeid + '&id=' + tunnelid;
    if (rcookie) value += '&rauth=' + rcookie;
    this.safeSend({ action: 'msg', type: 'tunnel', nodeid, value, usage: protocol });
    return { relayUrl: relayBase(), nodeid, tunnelid, auth: cookie, protocol };
  }

  // ---- desktop thumbnails (server-side capture + cache) ----
  private thumbs = new Map<string, { buf: Buffer; ts: number }>();
  private capturing = new Set<string>();
  private thumbTimer: ReturnType<typeof setInterval> | null = null;

  public getThumb(nodeid: string): { buf: Buffer; ts: number } | null {
    return this.thumbs.get(nodeid) || null;
  }

  /** Grab one desktop frame over KVM and store a JPEG thumbnail. Returns the cached buffer on failure. */
  public async captureThumbnail(nodeid: string, scaling = 256): Promise<{ buf: Buffer; ts: number } | null> {
    if (this.capturing.has(nodeid)) return this.thumbs.get(nodeid) || null;
    this.capturing.add(nodeid);
    try {
      const session = await this.openDesktopSession(nodeid, 2);
      const frame = await this.collectFrame(session, scaling);
      if (frame && frame.tiles.length > 0) {
        const buf = await this.compositeFrame(frame);
        if (buf) { const entry = { buf, ts: Date.now() }; this.thumbs.set(nodeid, entry); return entry; }
      }
    } catch { /* fall through to cached */ }
    finally { this.capturing.delete(nodeid); }
    return this.thumbs.get(nodeid) || null;
  }

  /** Periodically refresh thumbnails for all online nodes so cards always have a recent image. */
  public startThumbnailScheduler(intervalMs = 300000): void {
    if (this.thumbTimer) return;
    const tick = async () => {
      if (!this.authed) return;
      for (const node of this.nodes.values()) {
        if (!node.online) continue;
        try { await this.captureThumbnail(node.nodeid); } catch { /* ignore */ }
      }
    };
    this.thumbTimer = setInterval(() => { void tick(); }, intervalMs);
    if (this.thumbTimer.unref) this.thumbTimer.unref();
    setTimeout(() => { void tick(); }, 8000); // warm shortly after boot
  }

  private handleFrameCmd(
    cmd: number,
    view: Buffer,
    tiles: Array<{ x: number; y: number; jpeg: Buffer }>,
    setScreen: (w: number, h: number) => void
  ): void {
    if (cmd === 7 && view.length >= 8) {
      setScreen(view.readUInt16BE(4), view.readUInt16BE(6));
    } else if (cmd === 3 && view.length > 8) {
      tiles.push({ x: view.readUInt16BE(4), y: view.readUInt16BE(6), jpeg: Buffer.from(view.subarray(8)) });
    }
  }

  private collectFrame(
    session: { relayUrl: string; nodeid: string; tunnelid: string; auth: string; protocol: number },
    scaling: number
  ): Promise<{ w: number; h: number; tiles: Array<{ x: number; y: number; jpeg: Buffer }> } | null> {
    return new Promise((resolve) => {
      const { relayUrl, nodeid, tunnelid, auth, protocol } = session;
      const sep = relayUrl.includes('?') ? '&' : '?';
      const url =
        `${relayUrl}${sep}browser=1&p=${protocol}&nodeid=${encodeURIComponent(nodeid)}` +
        `&id=${encodeURIComponent(tunnelid)}&auth=${encodeURIComponent(auth)}`;
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { resolve(null); return; }
      let handshook = false;
      let acc = Buffer.alloc(0);
      let w = 0, h = 0;
      const tiles: Array<{ x: number; y: number; jpeg: Buffer }> = [];
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        resolve(tiles.length ? { w, h, tiles } : null);
      };
      const timer = setTimeout(finish, 4000);
      let earlyDone = false;
      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary) {
          const s = data.toString();
          if (!handshook && (s === 'c' || s === 'cr')) {
            handshook = true;
            try {
              ws.send('2');
              ws.send(Buffer.from([0, 5, 0, 10, 1, 50, (scaling >> 8) & 0xff, scaling & 0xff, 0, 100]));
              ws.send(Buffer.from([0, 8, 0, 5, 0]));
              ws.send(Buffer.from([0, 6, 0, 4]));
            } catch { /* ignore */ }
          }
          return;
        }
        acc = acc.length ? Buffer.concat([acc, data]) : Buffer.from(data);
        let off = 0;
        while (acc.length - off >= 4) {
          const type = acc.readUInt16BE(off);
          let size = acc.readUInt16BE(off + 2);
          if (type === 27) {
            if (acc.length - off < 8) break;
            const rs = acc.readUInt32BE(off + 4);
            const tot = rs + 8;
            if (acc.length - off < tot) break;
            const inner = acc.subarray(off + 8, off + tot);
            this.handleFrameCmd(inner.readUInt16BE(0), inner, tiles, (nw, nh) => { w = nw; h = nh; });
            off += tot; continue;
          }
          if (size < 4) size = 4;
          if (acc.length - off < size) break;
          this.handleFrameCmd(type, acc.subarray(off, off + size), tiles, (nw, nh) => { w = nw; h = nh; });
          off += size;
        }
        acc = off > 0 ? acc.subarray(off) : acc;
        // Once we have the screen size and a decent set of tiles, we have a usable frame.
        if (w > 0 && tiles.length >= 8 && !earlyDone) { earlyDone = true; setTimeout(finish, 600); }
      });
      ws.on('close', finish);
      ws.on('error', finish);
    });
  }

  private async compositeFrame(frame: {
    w: number; h: number; tiles: Array<{ x: number; y: number; jpeg: Buffer }>;
  }): Promise<Buffer | null> {
    try {
      const metas = await Promise.all(
        frame.tiles.map((t) => sharp(t.jpeg).metadata().catch(() => ({ width: 0, height: 0 } as sharp.Metadata)))
      );
      let W = frame.w, H = frame.h;
      frame.tiles.forEach((t, i) => {
        W = Math.max(W, t.x + (metas[i].width || 0));
        H = Math.max(H, t.y + (metas[i].height || 0));
      });
      if (W <= 0 || H <= 0) return null;
      const comps = frame.tiles.map((t) => ({ input: t.jpeg, left: t.x, top: t.y }));
      const full = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 15, g: 18, b: 24 } } })
        .composite(comps).png().toBuffer();
      return await sharp(full).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    } catch {
      return null;
    }
  }
}

export const meshClient = new MeshClient();
