// Shared helpers for Backstage tabs that read live data from a device.
// runRemoteScriptOnDevice never throws: it folds failures and timeouts into
// bracketed text. These helpers turn that text back into real errors so a tab
// can show an error state instead of rendering something it made up.

type Shell = 'powershell' | 'cmd' | 'bash';
export type RunRemote = (deviceId: string, script: string, shell?: Shell) => Promise<string>;

const JSON_MARK = '<<APEX-JSON>>';
const ERR_MARK = '<<APEX-ERR>>';

/** Returns a human-readable error if the output is one of runRemoteScriptOnDevice's failure shapes. */
export function remoteOutputError(output: string): string | null {
  const t = output.trimStart();
  if (t.startsWith('[Command Dispatched')) {
    return 'The device did not answer within 25 seconds. It may be offline, asleep or busy.';
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
