import { WebSocket } from 'ws';

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
      case 'close': {
        if (msg.cause) this.fail('server closed control channel: ' + msg.cause);
        break;
      }
      default:
        break;
    }
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
}

export const meshClient = new MeshClient();
