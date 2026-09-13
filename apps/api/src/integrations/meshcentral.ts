/**
 * MeshCentral integration.
 *
 * MeshCentral runs headless on its own VM; OpenMSP drives it over its control
 * API and embeds the remote-desktop viewer in the console. Config comes from env:
 *   MESH_SERVER_URL   e.g. https://mesh.openmsp.io
 *   MESH_GROUP        device group endpoints join (default "OpenMSP")
 *   MESH_LOGIN_TOKEN  a MeshCentral login token (create with:
 *                     `node meshcentral --logintoken <user>` on the mesh server)
 *   MESH_LOGIN_USER   optional username for the embed login (default "admin")
 *
 * The login token lets the console open a device's desktop without a separate
 * MeshCentral sign-in. Exact viewer params can be tuned per server version.
 */

export interface MeshConfig {
  serverUrl: string;
  group: string;
  loginToken: string;
  loginUser: string;
}

export function meshConfig(): MeshConfig {
  return {
    serverUrl: (process.env.MESH_SERVER_URL || '').replace(/\/$/, ''),
    group: process.env.MESH_GROUP || 'OpenMSP',
    loginToken: process.env.MESH_LOGIN_TOKEN || '',
    loginUser: process.env.MESH_LOGIN_USER || 'admin'
  };
}

export function isConfigured(): boolean {
  return !!meshConfig().serverUrl;
}

/**
 * Build the URL the console iframes to show a device's live desktop.
 * viewmode=11 opens the Desktop tab; `hide` trims MeshCentral chrome so it sits
 * cleanly inside the OpenMSP shell; `gotonode` targets the device.
 */
export function buildDesktopEmbedUrl(meshNodeId: string): string {
  const c = meshConfig();
  if (!c.serverUrl || !meshNodeId) return '';
  const params = new URLSearchParams({
    viewmode: '11',        // 11 = Desktop
    gotonode: meshNodeId,
    hide: '127',           // hide top bar / tabs / footer chrome
    console: '0'
  });
  if (c.loginToken) params.set('login', c.loginToken);
  return `${c.serverUrl}/?${params.toString()}`;
}

/** Lightweight reachability check against the MeshCentral server. */
export async function ping(timeoutMs = 4000): Promise<boolean> {
  const c = meshConfig();
  if (!c.serverUrl) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // MeshCentral serves its login page at the root; a 200/302 means it's up.
    const res = await fetch(c.serverUrl, { signal: ctrl.signal, redirect: 'manual' });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * List MeshCentral nodes (devices). Implemented against the MeshCentral control
 * WebSocket; requires MESH_LOGIN_TOKEN. Best-effort — returns [] when not
 * configured or unreachable. TODO: validate action/schema against the live
 * server version and map meshNodeId ↔ OpenMSP deviceId (by hostname/serial).
 */
export interface MeshNode {
  nodeid: string;
  name: string;
  osdesc?: string;
  conn?: number; // connectivity bitmask; >0 = online
}

export async function listNodes(): Promise<MeshNode[]> {
  const c = meshConfig();
  if (!c.serverUrl || !c.loginToken) return [];
  // Deferred to the console-integration step: open control.ashx WS with the
  // login token, send { action: 'nodes' }, collect the response. Returning []
  // here keeps the API stable until that flow is validated against the server.
  return [];
}
