import { mesh } from '../../../services/api';

/**
 * Runs a PowerShell script on a Windows device over a hidden MeshCentral
 * terminal relay (protocol 1, cmd.exe as SYSTEM) and returns its output.
 * ---------------------------------------------------------------------------
 * The MeshCentral agent is always connected, so this answers in seconds; the
 * ApexMSP agent only picks up queued commands on its 30s heartbeat.
 *
 * The script travels as `powershell -EncodedCommand` (no quoting issues, and
 * the echoed command line never contains the output markers). Its output is
 * returned base64-encoded between markers, so terminal line wrapping and VT
 * escape sequences can be stripped without corrupting it.
 */

const PROTOCOL_TERMINAL = 1;
const RUN_TIMEOUT_MS = 60_000;
const MAX_CMDLINE = 8000; // cmd.exe limit is 8191
const MARK = 'APXMRK';

const toUtf16Base64 = (text: string): string => {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromBase64Utf8 = (b64: string): string => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

// eslint-disable-next-line no-control-regex
const VT_ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78]/g;

/** Extracts the marked, base64-encoded output from raw terminal text, or null if incomplete. */
export function extractMarkedOutput(raw: string): string | null {
  const clean = raw.replace(VT_ESCAPES, '').replace(/\s+/g, '');
  const start = clean.indexOf(MARK + 'S');
  if (start < 0) return null;
  const end = clean.indexOf(MARK + 'E', start);
  if (end < 0) return null;
  const b64 = clean.slice(start + MARK.length + 1, end).replace(/[^A-Za-z0-9+/=]/g, '');
  return fromBase64Utf8(b64);
}

/** Builds the cmd.exe line that runs `script` and prints its output between markers. */
export function buildCommandLine(script: string): string {
  const wrapper = [
    // Join lines as-is (Out-String would wrap/truncate long JSON lines).
    `$apexOut = ((& {`,
    script,
    `} 2>&1) | ForEach-Object { [string]$_ }) -join [Environment]::NewLine`,
    `$apexB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$apexOut))`,
    `$apexMark = 'APX' + 'MRK'`,
    `[Console]::Out.Write($apexMark + 'S' + $apexB64 + $apexMark + 'E')`
  ].join('\n');
  const line = `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${toUtf16Base64(wrapper)}`;
  if (line.length > MAX_CMDLINE) throw new Error('The script is too long to run over the terminal channel.');
  return line;
}

/** Runs `script` with PowerShell on the device and resolves with its combined output. */
export async function runMeshPowerShell(deviceId: string, script: string, onSessionOpened?: () => void): Promise<string> {
  const cmdline = buildCommandLine(script);
  const s = await mesh.startSession({ deviceId, protocol: PROTOCOL_TERMINAL });
  if (!s.online) throw new Error(`${s.deviceName} is offline in ApexConnect.`);
  onSessionOpened?.();

  return new Promise<string>((resolve, reject) => {
    const sep = s.relayUrl.includes('?') ? '&' : '?';
    const url =
      `${s.relayUrl}${sep}browser=1&p=${s.protocol}&nodeid=${encodeURIComponent(s.nodeid)}` +
      `&id=${encodeURIComponent(s.tunnelid)}` + (s.auth ? `&auth=${encodeURIComponent(s.auth)}` : '');
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const decoder = new TextDecoder();
    let raw = '';
    let sent = false;
    let done = false;

    const finish = (err: Error | null, value?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { if (ws.readyState === WebSocket.OPEN) ws.send('exit\r'); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err); else resolve(value ?? '');
    };
    const timer = setTimeout(() => finish(new Error('The device did not finish the command within 60 seconds.')), RUN_TIMEOUT_MS);

    const sendCommand = () => {
      if (sent) return;
      sent = true;
      try { ws.send(cmdline + '\r'); } catch (e) { finish(e as Error); }
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        if (ev.data === 'c' || ev.data === 'cr') {
          ws.send(String(s.protocol));
          ws.send(JSON.stringify({ ctrlChannel: '102938', type: 'termsize', cols: 250, rows: 50 }));
          // Give cmd.exe a moment to print its banner/prompt before typing.
          setTimeout(sendCommand, 400);
          return;
        }
        if (ev.data.startsWith('{') && ev.data.includes('102938')) return; // control channel
        raw += ev.data;
      } else if (ev.data instanceof ArrayBuffer) {
        raw += decoder.decode(new Uint8Array(ev.data), { stream: true });
      }
      if (!sent) return;
      try {
        const out = extractMarkedOutput(raw);
        if (out != null) finish(null, out);
      } catch {
        finish(new Error('The device returned output that could not be decoded.'));
      }
    };
    ws.onclose = () => finish(new Error('The terminal connection to the device closed before the command finished.'));
  });
}
