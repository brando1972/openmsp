import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { meshClient, type MeshNode } from './meshClient.js';
import type { ManagedDevice, DeviceCommand } from '@openmsp/api-types';

/**
 * Cross-agent watchdog ("mutual healing").
 * ---------------------------------------------------------------------------
 * ApexMSP runs two independent agents on Mac/Windows endpoints: the RMM agent
 * (heartbeat/telemetry/commands) and the MeshCentral agent (remote desktop).
 * Each is a privileged channel, so either can repair the other:
 *
 *   RMM down + Mesh up  -> restart the RMM agent via MeshCentral runcommands.
 *   Mesh down + RMM up  -> restart the Mesh agent via an RMM device command.
 *
 * The control plane is the arbiter. It only acts on a LINKED PAIR (a device we
 * know by both its RMM record and its mesh node) -- orphans (a mesh node with no
 * RMM record, like an un-enrolled Windows box) are never auto-touched; those get
 * a manual "Deploy RMM" action instead. Guardrails: a stale threshold, a
 * per-device cooldown, a rolling-hour attempt cap, restart-only (never reinstall)
 * in auto mode, full audit, and a kill switch (HEAL_AUTO=0).
 *
 * NOTE: the actual remote command payloads (service names, MeshCentral
 * runcommands type enum) are best-effort until validated against a live down
 * device; the detection, guards, audit and manual triggers are exercised now.
 */

const RMM_STALE_MS = 10 * 60 * 1000; // RMM considered down after 10 min without a heartbeat
const HEAL_COOLDOWN_MS = 15 * 60 * 1000; // min gap between heal attempts for one device+agent
const HEAL_MAX_PER_HOUR = 2; // rolling-hour cap per device+agent

// Service/label candidates (override via env if the installers use different names).
const RMM_WIN_SERVICES = (process.env.RMM_WIN_SERVICE || 'ApexAgent,OpenMSP Agent,openmsp-agent').split(',').map((s) => s.trim()).filter(Boolean);
const RMM_MAC_LABELS = (process.env.RMM_MAC_LABEL || 'app.apexmsp.agent,com.apexmsp.agent').split(',').map((s) => s.trim()).filter(Boolean);
const MESH_WIN_SERVICE = process.env.MESH_WIN_SERVICE || 'Mesh Agent';
const MESH_MAC_LABEL = process.env.MESH_MAC_LABEL || 'meshagent';

export type HealAgent = 'rmm' | 'mesh';

interface HealMark { attempts: number[]; last: number }
const marks = new Map<string, HealMark>(); // key = deviceId|agent

function orgId(): string {
  const org = Array.from(store.orgs.values())[0];
  return org ? org.id : '00000000-0000-0000-0000-000000000001';
}

// ---- repair scripts -------------------------------------------------------

function restartRmmScript(os: string): { cmds: string; shell: 'ps' | 'bash' } {
  if (/win/i.test(os)) {
    const list = RMM_WIN_SERVICES.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
    // Restart the first matching RMM service that exists.
    return {
      shell: 'ps',
      cmds: `foreach($n in @(${list})){ $s=Get-Service -Name $n -ErrorAction SilentlyContinue; if($s){ Restart-Service -Name $n -Force -ErrorAction SilentlyContinue; break } }`
    };
  }
  const kicks = RMM_MAC_LABELS.map(
    (l) => `launchctl kickstart -k system/${l} 2>/dev/null; launchctl kickstart -k gui/$(id -u 2>/dev/null)/${l} 2>/dev/null;`
  ).join(' ');
  return { shell: 'bash', cmds: `${kicks} true` };
}

function restartMeshScript(os: string): { script: string; shell: 'ps' | 'bash'; serviceName: string } {
  if (/win/i.test(os)) {
    return {
      shell: 'ps',
      serviceName: MESH_WIN_SERVICE,
      script: `Restart-Service -Name '${MESH_WIN_SERVICE.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`
    };
  }
  return {
    shell: 'bash',
    serviceName: MESH_MAC_LABEL,
    script: `sudo launchctl kickstart -k system/${MESH_MAC_LABEL} 2>/dev/null || launchctl kickstart -k system/${MESH_MAC_LABEL} 2>/dev/null; true`
  };
}

// ---- repair actions -------------------------------------------------------

/** Fix the RMM agent on a node by restarting it through the (healthy) Mesh channel. */
export async function repairRmmViaMesh(nodeid: string, os: string): Promise<void> {
  const { cmds, shell } = restartRmmScript(os);
  await meshClient.runCommand(nodeid, cmds, shell);
}

/** Fix the Mesh agent on a device by enqueueing an RMM command (picked up on next heartbeat). */
export function repairMeshViaRmm(deviceId: string, os: string): DeviceCommand | null {
  const device = store.devices.get(deviceId);
  if (!device) return null;
  const { script, shell, serviceName } = restartMeshScript(os);
  const id = `cmd-heal-${uuidv4().substring(0, 8)}`;
  const cmd: DeviceCommand = {
    id,
    deviceId,
    orgId: orgId(),
    commandType: 'run_script' as any,
    payload: { script, shell, serviceName, purpose: 'heal-mesh-agent' } as any,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  store.deviceCommands.set(id, cmd);
  return cmd;
}

/** Manual repair entrypoint (from the console). Returns a short status string. */
export async function repairAgent(nodeid: string, agent: HealAgent): Promise<{ ok: boolean; detail: string }> {
  const node = meshClient.getNode(nodeid);
  const device = linkedDevice(nodeid, node);
  const os = device?.os || (node && /win/i.test(node.rname || '') ? 'windows' : 'macos');
  try {
    if (agent === 'rmm') {
      if (!node || !node.online) return { ok: false, detail: 'Mesh agent is offline - cannot reach the device to restart the RMM agent.' };
      await repairRmmViaMesh(nodeid, os);
      record(device?.id || nodeid, 'rmm', nodeid, 'manual');
      return { ok: true, detail: 'Sent restart to the RMM agent via ApexConnect.' };
    }
    if (!device) return { ok: false, detail: 'No linked RMM device - cannot enqueue a command to restart the Mesh agent.' };
    if (!repairMeshViaRmm(device.id, os)) return { ok: false, detail: 'Failed to enqueue the RMM command.' };
    record(device.id, 'mesh', nodeid, 'manual');
    return { ok: true, detail: 'Queued a Mesh-agent restart for the RMM agent to run on its next check-in.' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'repair failed' };
  }
}

// ---- linkage + guards -----------------------------------------------------

/** The RMM device linked to a mesh node: explicit meshNodes map, else hostname match. */
export function linkedDevice(nodeid: string, node: MeshNode | null): ManagedDevice | null {
  for (const [deviceId, nid] of store.meshNodes) {
    if (nid === nodeid) { const d = store.devices.get(deviceId); if (d) return d; }
  }
  if (!node) return null;
  const names = [node.name, node.rname].map((s) => (s || '').toLowerCase());
  const bare = names.map((s) => s.split('.')[0]);
  for (const d of store.devices.values()) {
    const cands = [d.hostname, d.name].filter(Boolean).map((x) => (x as string).toLowerCase());
    if (cands.some((c) => names.includes(c) || bare.includes(c.split('.')[0]))) return d;
  }
  return null;
}

function allowed(key: string): boolean {
  const now = Date.now();
  const m = marks.get(key);
  if (!m) return true;
  if (now - m.last < HEAL_COOLDOWN_MS) return false;
  const inHour = m.attempts.filter((t) => now - t < 3600_000);
  return inHour.length < HEAL_MAX_PER_HOUR;
}

function record(deviceId: string, agent: HealAgent, nodeid: string, mode: 'auto' | 'manual'): void {
  const key = deviceId + '|' + agent;
  const now = Date.now();
  const m = marks.get(key) || { attempts: [], last: 0 };
  m.attempts = m.attempts.filter((t) => now - t < 3600_000);
  m.attempts.push(now);
  m.last = now;
  marks.set(key, m);
  store.recordAudit({
    orgId: orgId(),
    actorName: mode === 'auto' ? 'Cross-agent watchdog' : 'Operator',
    action: 'agent.heal',
    targetType: 'device',
    targetId: deviceId,
    details: { agent, nodeid, mode }
  });
}

// ---- watchdog -------------------------------------------------------------

async function tick(): Promise<void> {
  if (process.env.HEAL_AUTO === '0') return;
  if (!meshClient.configured()) return;
  const now = Date.now();
  for (const node of meshClient.listNodes()) {
    const device = linkedDevice(node.nodeid, node);
    if (!device) continue; // only linked pairs are auto-healed; orphans are manual
    const lastSeen = device.metrics?.lastSeen ? Date.parse(device.metrics.lastSeen) : 0;
    if (!lastSeen) continue; // never seen the RMM side - not a real pair yet
    const rmmUp = now - lastSeen < RMM_STALE_MS;
    const meshUp = node.online;

    if (meshUp && !rmmUp) {
      const key = device.id + '|rmm';
      if (!allowed(key)) continue;
      try { await repairRmmViaMesh(node.nodeid, device.os); record(device.id, 'rmm', node.nodeid, 'auto'); } catch { /* next tick */ }
    } else if (!meshUp && rmmUp) {
      const key = device.id + '|mesh';
      if (!allowed(key)) continue;
      if (repairMeshViaRmm(device.id, device.os)) record(device.id, 'mesh', node.nodeid, 'auto');
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startWatchdog(intervalMs = 120000): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, intervalMs);
  if (timer.unref) timer.unref();
  setTimeout(() => { void tick(); }, 20000); // first pass shortly after boot
}
