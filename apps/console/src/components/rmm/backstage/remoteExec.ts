// Shared helpers for Backstage tabs that read live data from a device.
// runRemoteScriptOnDevice never throws: it folds failures and timeouts into
// bracketed text. These helpers turn that text back into real errors so a tab
// can show an error state instead of rendering something it made up.

import { devices } from '../../../services/api';
import { runMeshPowerShell } from './meshShell';

type Shell = 'powershell' | 'cmd' | 'bash';
export type RunRemote = (deviceId: string, script: string, shell?: Shell) => Promise<string>;

// The agent only picks up commands on its heartbeat (30s by default), so a
// request can sit queued for a full cycle before it even starts running.
const DEVICE_WAIT_MS = 90_000;
const POLL_MS = 1_500;

/**
 * Same contract as AppContext's runRemoteScriptOnDevice (bracketed failure
 * text, never throws). Uses the MeshCentral agent when it can, else waits
 * long enough to span an ApexMSP agent check-in.
 */
export const runDeviceScript: RunRemote = async (deviceId, script, shell = 'powershell') => {
  // Prefer the always-connected MeshCentral agent; fall back to the ApexMSP
  // agent's command queue only if a MeshCentral session can't be opened.
  if (shell === 'powershell') {
    let sessionOpened = false;
    try {
      return await runMeshPowerShell(deviceId, script, () => { sessionOpened = true; });
    } catch (e) {
      if (sessionOpened) return `[Execution Failed]\n${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return runViaAgentQueue(deviceId, script, shell);
};

const runViaAgentQueue: RunRemote = async (deviceId, script, shell = 'powershell') => {
  let commandId: string;
  try {
    const cmd = await devices.sendCommand(deviceId, { commandType: 'run_script', payload: { script, shell } });
    commandId = cmd.id;
  } catch (e) {
    return `[ApexMSP Agent Error]\n${e instanceof Error ? e.message : String(e)}`;
  }
  const started = Date.now();
  while (Date.now() - started < DEVICE_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const c = await devices.getDeviceCommand(deviceId, commandId);
      if (c?.status === 'completed') return c.output || '[Command executed successfully (no output)]';
      if (c?.status === 'failed') return `[Execution Failed]\n${c.error || c.output || 'Unknown error occurred on agent'}`;
    } catch {
      // transient network error: keep polling
    }
  }
  return `[Command Dispatched (ID: ${commandId})]`;
};

const JSON_MARK = '<<APEX-JSON>>';
const ERR_MARK = '<<APEX-ERR>>';

/** Returns a human-readable error if the output is one of runRemoteScriptOnDevice's failure shapes. */
export function remoteOutputError(output: string): string | null {
  const t = output.trimStart();
  if (t.startsWith('[Command Dispatched')) {
    return "The ApexMSP agent on this device didn't pick up the request within 90 seconds. Check that the ApexMSPAgent service is running and the device shows online.";
  }
  if (t.startsWith('[Execution Failed]')) {
    return t.slice('[Execution Failed]'.length).trim() || 'The command failed on the device.';
  }
  if (t.startsWith('[ApexMSP Agent Error]')) {
    return t.slice('[ApexMSP Agent Error]'.length).trim() || 'Could not reach the device.';
  }
  return null;
}

/** Runs a script and throws if the agent reported a failure or never answered. */
export async function runRemoteChecked(run: RunRemote, deviceId: string, script: string, shell: Shell = 'powershell'): Promise<string> {
  const out = await run(deviceId, script, shell);
  const err = remoteOutputError(out);
  if (err) throw new Error(err);
  return out;
}

/** Quotes a value as a PowerShell single-quoted string literal. */
export const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * Evaluates a PowerShell expression on the device and returns its value as JSON.
 * Terminating errors inside the expression come back as a thrown Error.
 */
export async function runRemotePsJson<T>(run: RunRemote, deviceId: string, expression: string): Promise<T> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $apexResult = ${expression}`,
    `  Write-Output ('${JSON_MARK}' + (ConvertTo-Json -InputObject $apexResult -Compress -Depth 4))`,
    '} catch {',
    `  Write-Output ('${ERR_MARK}' + $_.Exception.Message)`,
    '}'
  ].join('\n');
  const out = await runRemoteChecked(run, deviceId, script, 'powershell');

  const errAt = out.indexOf(ERR_MARK);
  if (errAt >= 0) throw new Error(out.slice(errAt + ERR_MARK.length).trim() || 'The command failed on the device.');

  const jsonAt = out.indexOf(JSON_MARK);
  if (jsonAt < 0) throw new Error(`Unexpected response from the device: ${out.slice(0, 200)}`);
  const body = out.slice(jsonAt + JSON_MARK.length).split(/\r?\n/)[0].trim();
  if (!body) return null as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('The device returned data that could not be read.');
  }
}

/** Like runRemotePsJson, but always returns an array (PowerShell collapses 0/1-item results). */
export async function runRemotePsList<T>(run: RunRemote, deviceId: string, expression: string): Promise<T[]> {
  const value = await runRemotePsJson<T | T[] | null>(run, deviceId, `@(${expression})`);
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
