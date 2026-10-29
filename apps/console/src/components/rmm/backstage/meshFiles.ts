import { mesh, devices } from '../../../services/api';

/**
 * File transfer channels for Windows & macOS devices:
 * 1. MeshFileChannel — file upload/download over MeshCentral's file relay
 *    (meshrelay protocol 5), the same channel MeshCentral's own Files tab uses.
 * 2. AgentFileChannel — live file browsing, mkdir, delete, upload, and download
 *    over the ApexMSP RMM Agent (`openmsp-agent` / ApexMSP macOS & Windows app)
 *    when MeshCentral is offline or not yet paired on the endpoint.
 */

const PROTOCOL_FILES = 5;
const UPLOAD_BLOCK = 32 * 1024;
const UPLOAD_WINDOW = 4;      // blocks in flight before waiting for acks
const DOWNLOAD_WINDOW = 4;    // blocks requested ahead
const LAST_BLOCK_FLAG = 0x01000001;

// AgentFileChannel chunk sizes (bounded to fit safely inside executor.go's 32 KB stdout cap
// and OS command-line limits).
const AGENT_DL_CHUNK = 21 * 1024;          // 21 KB raw = 28 KB base64 (< 32 KB stdout limit)
const AGENT_UL_CHUNK_POSIX = 192 * 1024;   // 192 KB raw = 256 KB base64 (< 1 MB macOS ARG_MAX)
const AGENT_UL_CHUNK_WIN = 15 * 1024;      // 15 KB raw = 20 KB base64 (< 32 KB Win32 cmdline limit)

export type Progress = (done: number, total: number | null) => void;

interface JsonMsg { action?: string; sub?: string; id?: number; reqid?: number; [k: string]: unknown }

export interface RemoteDirEntry {
  n: string;
  t: 1 | 2 | 3;
  s?: number;
  d?: string;
}

export interface FileChannel {
  closed: boolean;
  readonly mode: 'mesh' | 'agent';
  close(): void;
  ls(path: string): Promise<RemoteDirEntry[] | null>;
  rm(dir: string, names: string[]): Promise<void>;
  mkdir(path: string): Promise<void>;
  download(path: string, onProgress?: Progress, signal?: AbortSignal, expectedSize?: number): Promise<Uint8Array<ArrayBuffer>>;
  upload(path: string, data: Blob, onProgress?: Progress, signal?: AbortSignal): Promise<void>;
}

type Handler = {
  onJson: (msg: JsonMsg) => void;
  onBinary: (data: Uint8Array) => void;
  onClose: (reason: string) => void;
};

export class TransferCancelled extends Error {
  constructor() { super('Transfer cancelled.'); }
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const sub = bytes.subarray(i, i + step);
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
};

const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const clean = b64.replace(/\s+/g, '');
  if (!clean) return new Uint8Array(0);
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
};

const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export class MeshFileChannel implements FileChannel {
  private ws: WebSocket;
  private handler: Handler | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  closed = false;
  readonly mode = 'mesh' as const;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        this.dispatchText(ev.data);
        return;
      }
      if (!(ev.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(ev.data);
      if (bytes.length > 0 && bytes[0] === 123) this.dispatchText(new TextDecoder().decode(bytes));
      else this.handler?.onBinary(bytes);
    };
    ws.onclose = () => {
      this.closed = true;
      this.handler?.onClose('The file transfer connection to the device closed.');
    };
  }

  /**
   * Opens a file channel to the device. Prefers the fast MeshCentral protocol-5
   * WebSocket relay when online, and automatically falls back to the ApexMSP
   * RMM Agent (`openmsp-agent` / ApexMSP app) when MeshCentral is offline.
   */
  static async open(deviceId: string, os: 'windows' | 'macos' | 'linux' = 'windows'): Promise<FileChannel> {
    try {
      return await MeshFileChannel.openMesh(deviceId);
    } catch (meshErr) {
      try {
        return await AgentFileChannel.open(deviceId, os);
      } catch {
        throw meshErr;
      }
    }
  }

  /** Opens a MeshCentral protocol-5 file relay to the device and resolves once attached. */
  static openMesh(deviceId: string): Promise<MeshFileChannel> {
    return mesh.startSession({ deviceId, protocol: PROTOCOL_FILES }).then((s) => new Promise((resolve, reject) => {
      if (!s.online) {
        reject(new Error(`${s.deviceName} is offline in ApexConnect, so files can't be transferred right now.`));
        return;
      }
      const sep = s.relayUrl.includes('?') ? '&' : '?';
      const url =
        `${s.relayUrl}${sep}browser=1&p=${s.protocol}&nodeid=${encodeURIComponent(s.nodeid)}` +
        `&id=${encodeURIComponent(s.tunnelid)}` + (s.auth ? `&auth=${encodeURIComponent(s.auth)}` : '');
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Timed out waiting for the device to accept the file transfer.'));
      }, 20_000);
      ws.onmessage = (ev: MessageEvent) => {
        if (ev.data === 'c' || ev.data === 'cr') {
          clearTimeout(timer);
          ws.send(String(s.protocol));
          resolve(new MeshFileChannel(ws));
        }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error('The device closed the file transfer connection.'));
      };
    }));
  }

  close(): void {
    this.closed = true;
    try { this.ws.close(); } catch { /* ignore */ }
  }

  private dispatchText(text: string) {
    let msg: JsonMsg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg && typeof msg === 'object') this.handler?.onJson(msg);
  }

  private send(value: JsonMsg | Uint8Array) {
    if (this.ws.readyState !== WebSocket.OPEN) throw new Error('The file transfer connection is not open.');
    this.ws.send(value instanceof Uint8Array ? value : JSON.stringify(value));
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Lists a folder. Resolves null when the agent can't read it (missing or access denied). */
  ls(path: string): Promise<RemoteDirEntry[] | null> {
    return this.enqueue(() => new Promise<RemoteDirEntry[] | null>((resolve, reject) => {
      const reqid = this.nextId++;
      const timer = setTimeout(() => finish(new Error('The device did not answer the folder listing in time.')), 30_000);
      const finish = (err: Error | null, value?: RemoteDirEntry[] | null) => {
        clearTimeout(timer);
        this.handler = null;
        if (err) reject(err); else resolve(value ?? null);
      };
      this.handler = {
        onJson: (msg) => {
          if (msg.reqid !== reqid || msg.action) return;
          finish(null, Array.isArray(msg.dir) ? (msg.dir as RemoteDirEntry[]) : null);
        },
        onBinary: () => {},
        onClose: (reason) => finish(new Error(reason))
      };
      try { this.send({ action: 'ls', reqid, path }); } catch (e) { finish(e as Error); }
    }));
  }

  /** Deletes entries of `dir` (recursively for folders). The agent sends no reply; verify with ls. */
  rm(dir: string, names: string[]): Promise<void> {
    return this.enqueue(async () => { this.send({ action: 'rm', path: dir, delfiles: names, rec: true }); });
  }

  /** Creates one folder. Only call for folders that don't exist yet. */
  mkdir(path: string): Promise<void> {
    return this.enqueue(async () => { this.send({ action: 'mkdir', path }); });
  }

  /** Downloads one file. `signal` aborts the transfer. */
  download(path: string, onProgress?: Progress, signal?: AbortSignal, expectedSize?: number): Promise<Uint8Array<ArrayBuffer>> {
    return this.enqueue(() => new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const id = this.nextId++;
      const chunks: Uint8Array[] = [];
      let received = 0;
      let started = false;
      const finish = (err?: Error) => {
        this.handler = null;
        signal?.removeEventListener('abort', onAbort);
        if (err) { reject(err); return; }
        const out = new Uint8Array(received);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        resolve(out);
      };
      const onAbort = () => {
        try { this.send({ action: 'download', sub: 'stop', id }); } catch { /* ignore */ }
        finish(new TransferCancelled());
      };
      if (signal?.aborted) { reject(new TransferCancelled()); return; }
      signal?.addEventListener('abort', onAbort);

      this.handler = {
        onJson: (msg) => {
          if (msg.action !== 'download' || msg.id !== id) return;
          if (msg.sub === 'cancel') {
            finish(new Error(`The device could not open "${path}". It may be locked by another program or access is denied.`));
          } else if (msg.sub === 'start') {
            started = true;
            try {
              this.send({ action: 'download', sub: 'startack', id, ack: 1 });
              for (let i = 1; i < DOWNLOAD_WINDOW; i++) this.send({ action: 'download', sub: 'ack', id });
            } catch (e) { finish(e as Error); }
          }
        },
        onBinary: (data) => {
          if (!started || data.length < 4) return;
          const flags = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
          const body = data.slice(4);
          chunks.push(body);
          received += body.length;
          onProgress?.(received, expectedSize ?? null);
          if (flags === LAST_BLOCK_FLAG) {
            finish();
          } else {
            try { this.send({ action: 'download', sub: 'ack', id }); } catch (e) { finish(e as Error); }
          }
        },
        onClose: (reason) => finish(new Error(reason))
      };

      try { this.send({ action: 'download', sub: 'start', id, path }); } catch (e) { finish(e as Error); }
    }));
  }

  /** Uploads `data` to the full remote `path`, replacing any existing file. */
  upload(path: string, data: Blob, onProgress?: Progress, signal?: AbortSignal): Promise<void> {
    return this.enqueue(() => new Promise<void>((resolve, reject) => {
      const reqid = this.nextId++;
      const total = data.size;
      let offset = 0;
      let acked = 0;
      let sent = 0;
      let reading = false;
      let doneSent = false;

      const finish = (err?: Error) => {
        this.handler = null;
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err); else resolve();
      };
      const onAbort = () => {
        try { this.send({ action: 'uploaddone', reqid }); } catch { /* ignore */ }
        finish(new TransferCancelled());
      };
      if (signal?.aborted) { reject(new TransferCancelled()); return; }
      signal?.addEventListener('abort', onAbort);

      const pump = async () => {
        if (reading) return;
        reading = true;
        try {
          while (offset < total && sent - acked < UPLOAD_WINDOW) {
            const end = Math.min(offset + UPLOAD_BLOCK, total);
            let block = new Uint8Array(await data.slice(offset, end).arrayBuffer());
            if (block[0] === 0 || block[0] === 123) {
              const escaped = new Uint8Array(block.length + 1);
              escaped.set(block, 1);
              block = escaped;
            }
            this.send(block);
            offset = end;
            sent++;
          }
          if (offset >= total && acked === sent && !doneSent) {
            doneSent = true;
            this.send({ action: 'uploaddone', reqid });
          }
        } catch (e) {
          finish(e as Error);
        } finally {
          reading = false;
        }
      };

      this.handler = {
        onJson: (msg) => {
          if (msg.action === 'uploaderror') {
            finish(new Error(`The device could not write "${path}". Check the folder exists and isn't read-only.`));
          } else if (msg.action === 'uploadstart' && msg.reqid === reqid) {
            pump();
          } else if (msg.action === 'uploadack' && msg.reqid === reqid) {
            acked++;
            onProgress?.(Math.min(acked * UPLOAD_BLOCK, total), total);
            pump();
          } else if (msg.action === 'uploaddone' && msg.reqid === reqid) {
            onProgress?.(total, total);
            finish();
          }
        },
        onBinary: () => { /* not used during uploads */ },
        onClose: (reason) => finish(new Error(reason))
      };

      try { this.send({ action: 'upload', reqid, path }); } catch (e) { finish(e as Error); }
    }));
  }
}

/**
 * AgentFileChannel — live file system browsing, folder creation, delete, upload,
 * and download via the ApexMSP RMM Agent (`openmsp-agent` / ApexMSP macOS & Windows app).
 */
export class AgentFileChannel implements FileChannel {
  private deviceId: string;
  private os: 'windows' | 'macos' | 'linux';
  private queue: Promise<unknown> = Promise.resolve();
  closed = false;
  readonly mode = 'agent' as const;

  constructor(deviceId: string, os: 'windows' | 'macos' | 'linux' = 'macos') {
    this.deviceId = deviceId;
    this.os = os;
  }

  static async open(deviceId: string, os: 'windows' | 'macos' | 'linux' = 'macos'): Promise<AgentFileChannel> {
    try {
      const dev = await devices.getDevice(deviceId);
      const rawStatus = (dev as unknown as { status?: string }).status;
      if (dev && (dev.health === 'offline' || rawStatus === 'offline')) {
        throw new Error(`${dev.name} is offline in ApexMSP.`);
      }
      const detectedOs = dev?.os === 'windows' ? 'windows' : dev?.os === 'linux' ? 'linux' : os;
      return new AgentFileChannel(deviceId, detectedOs);
    } catch (e) {
      if (e instanceof Error && /offline/i.test(e.message)) throw e;
      return new AgentFileChannel(deviceId, os);
    }
  }

  close(): void {
    this.closed = true;
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async waitCommand(commandId: string, timeoutMs = 45_000, signal?: AbortSignal): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.closed) throw new Error('The file transfer channel was closed.');
      if (signal?.aborted) throw new TransferCancelled();
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 550);
        if (signal) {
          const onAbort = () => {
            clearTimeout(t);
            reject(new TransferCancelled());
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      if (signal?.aborted) throw new TransferCancelled();
      const cur = await devices.getDeviceCommand(this.deviceId, commandId);
      if (cur.status === 'completed') return cur.output ?? '';
      if (cur.status === 'failed') {
        throw new Error((cur.error || cur.output || 'Command failed on the device.').trim());
      }
    }
    throw new Error('The ApexMSP agent did not respond in time (check that the ApexMSP app is running on the device).');
  }

  private async runScript(script: string, timeoutMs = 45_000, signal?: AbortSignal): Promise<string> {
    if (this.closed) throw new Error('The file transfer channel is closed.');
    if (signal?.aborted) throw new TransferCancelled();
    const shell = this.os === 'windows' ? 'powershell' : 'bash';
    const cmd = await devices.sendCommand(this.deviceId, {
      commandType: 'run_script',
      payload: { script, shell }
    });
    return this.waitCommand(cmd.id, timeoutMs, signal);
  }

  ls(path: string): Promise<RemoteDirEntry[] | null> {
    return this.enqueue(async () => {
      let script: string;
      if (this.os === 'windows') {
        script = [
          "$ErrorActionPreference = 'Stop'",
          `$p = ${psQuote(path)}`,
          "if (-not (Test-Path -LiteralPath $p -PathType Container)) { Write-Output '__APEX_LS__null__END_LS__'; exit 0 }",
          "try {",
          "  $items = @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Select-Object -First 450 | ForEach-Object {",
          "    $isDir = [bool]$_.PSIsContainer",
          "    $o = @{ n = [string]$_.Name; t = $(if ($isDir) { 2 } else { 3 }); d = $_.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ') }",
          "    if (-not $isDir) { $o.s = [int64]$_.Length }",
          "    $o",
          "  })",
          "  $json = ConvertTo-Json -InputObject $items -Compress -Depth 3",
          "  Write-Output \"__APEX_LS__$json`__END_LS__\"",
          "} catch {",
          "  Write-Output '__APEX_LS__null__END_LS__'",
          "}"
        ].join('\n');
      } else {
        script = [
          `perl -MJSON::PP -MPOSIX=strftime -e '`,
          `  my $dir = shift;`,
          `  opendir(my $dh, $dir) or do { print "__APEX_LS__null__END_LS__"; exit 0; };`,
          `  my @out;`,
          `  while (defined(my $f = readdir($dh))) {`,
          `    next if $f eq "." || $f eq "..";`,
          `    my $p = $dir eq "/" ? "/$f" : "$dir/$f";`,
          `    my @st = stat($p);`,
          `    if (!@st) { @st = lstat($p); }`,
          `    next if !@st;`,
          `    my $is_dir = (-d _) ? 1 : 0;`,
          `    my $entry = {`,
          `      n => $f,`,
          `      t => $is_dir ? 2 : 3,`,
          `      d => strftime("%Y-%m-%dT%H:%M:%SZ", gmtime($st[9]))`,
          `    };`,
          `    $entry->{s} = $st[7] + 0 if !$is_dir;`,
          `    push @out, $entry;`,
          `    last if @out >= 450;`,
          `  }`,
          `  closedir($dh);`,
          `  print "__APEX_LS__" . encode_json(\\@out) . "__END_LS__";`,
          `' -- ${shQuote(path)}`
        ].join('\n');
      }

      const out = await this.runScript(script);
      const m = out.match(/__APEX_LS__([\s\S]*?)__END_LS__/);
      const raw = (m ? m[1] : out).trim();
      if (!raw || raw === 'null') return null;
      const parsed = JSON.parse(raw);
      if (parsed === null) return null;
      return (Array.isArray(parsed) ? parsed : [parsed]) as RemoteDirEntry[];
    });
  }

  mkdir(path: string): Promise<void> {
    return this.enqueue(async () => {
      const script = this.os === 'windows'
        ? `$ErrorActionPreference = 'Stop'\nNew-Item -ItemType Directory -Path ${psQuote(path)} -Force | Out-Null\nWrite-Output '__APEX_OK__'`
        : `mkdir -p -- ${shQuote(path)} && echo '__APEX_OK__'`;
      const out = await this.runScript(script);
      if (!out.includes('__APEX_OK__')) {
        throw new Error(out.trim() || `Could not create folder "${path}".`);
      }
    });
  }

  rm(dir: string, names: string[]): Promise<void> {
    return this.enqueue(async () => {
      const safeNames = names.filter((n) => n && n !== '.' && n !== '..');
      if (safeNames.length === 0) return;
      if (this.os === 'windows') {
        const cleanDir = dir.replace(/\\+$/, '');
        const lines = safeNames.map((n) => `Remove-Item -LiteralPath ${psQuote(`${cleanDir}\\${n}`)} -Recurse -Force -ErrorAction SilentlyContinue`);
        await this.runScript(lines.join('\n'));
      } else {
        const cleanDir = dir === '/' ? '' : dir.replace(/\/+$/, '');
        const args = safeNames.map((n) => shQuote(`${cleanDir}/${n}`)).join(' ');
        await this.runScript(`rm -rf -- ${args}`);
      }
    });
  }

  private buildDownloadChunkScript(path: string, offset: number, length: number): string {
    if (this.os === 'windows') {
      return [
        "$ErrorActionPreference = 'Stop'",
        `$p = ${psQuote(path)}`,
        "if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Write-Output '__APEX_DL__ERR:Cannot open file__END_DL__'; exit 0 }",
        "try {",
        "  $fs = [System.IO.File]::Open($p, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)",
        "  try {",
        "    $sz = [int64]$fs.Length",
        `    if (${offset} -gt 0) { [void]$fs.Seek([int64]${offset}, [System.IO.SeekOrigin]::Begin) }`,
        `    $buf = New-Object byte[] ${length}`,
        `    $read = $fs.Read($buf, 0, ${length})`,
        "    $b64 = if ($read -gt 0) { [Convert]::ToBase64String($buf, 0, $read) } else { '' }",
        "    Write-Output \"__APEX_DL__OK:$sz`:$b64`__END_DL__\"",
        "  } finally { $fs.Dispose() }",
        "} catch {",
        "  Write-Output \"__APEX_DL__ERR:$($_.Exception.Message)__END_DL__\"",
        "}"
      ].join('\n');
    }

    return [
      `perl -MMIME::Base64 -e '`,
      `  my ($p, $off, $len) = @ARGV;`,
      `  open(my $fh, "<:raw", $p) or do { print "__APEX_DL__ERR:$!__END_DL__"; exit 0; };`,
      `  my $sz = -s $fh // 0;`,
      `  if ($off > 0) { seek($fh, $off, 0) or do { print "__APEX_DL__ERR:Seek failed__END_DL__"; exit 0; }; }`,
      `  my $buf = "";`,
      `  read($fh, $buf, $len);`,
      `  close($fh);`,
      `  print "__APEX_DL__OK:$sz:" . encode_base64($buf, "") . "__END_DL__";`,
      `' -- ${shQuote(path)} ${offset} ${length}`
    ].join('\n');
  }

  private parseDownloadChunkOutput(path: string, out: string): { totalSize: number; bytes: Uint8Array<ArrayBuffer> } {
    const m = out.match(/__APEX_DL__([\s\S]*?)__END_DL__/);
    if (!m) {
      throw new Error(`Unexpected response from device while reading "${path}".`);
    }
    const payload = m[1];
    if (payload.startsWith('ERR:')) {
      throw new Error(`The device could not open "${path}": ${payload.slice(4)}`);
    }
    const firstColon = payload.indexOf(':');
    const secondColon = payload.indexOf(':', firstColon + 1);
    if (!payload.startsWith('OK:') || secondColon < 0) {
      throw new Error(`Malformed file data received for "${path}".`);
    }
    const totalSize = Number(payload.slice(firstColon + 1, secondColon)) || 0;
    const b64 = payload.slice(secondColon + 1);
    return { totalSize, bytes: base64ToBytes(b64) };
  }

  download(path: string, onProgress?: Progress, signal?: AbortSignal, expectedSize?: number): Promise<Uint8Array<ArrayBuffer>> {
    return this.enqueue(async () => {
      if (signal?.aborted) throw new TransferCancelled();

      // Fetch first chunk (also discovers exact file size in a single round-trip).
      const firstOut = await this.runScript(this.buildDownloadChunkScript(path, 0, AGENT_DL_CHUNK), 45_000, signal);
      const first = this.parseDownloadChunkOutput(path, firstOut);
      const totalSize = first.totalSize;
      onProgress?.(first.bytes.length, totalSize || expectedSize || null);

      if (first.bytes.length >= totalSize || first.bytes.length === 0) {
        return first.bytes;
      }

      const chunks: Uint8Array[] = [first.bytes];
      let received = first.bytes.length;
      const offsets: number[] = [];
      for (let off = first.bytes.length; off < totalSize; off += AGENT_DL_CHUNK) {
        offsets.push(off);
      }

      // Queue up to 8 chunk commands per heartbeat batch so the agent runs them all in one heartbeat.
      const BATCH_SIZE = 8;
      const shell = this.os === 'windows' ? 'powershell' : 'bash';
      for (let i = 0; i < offsets.length; i += BATCH_SIZE) {
        if (signal?.aborted) throw new TransferCancelled();
        const batchOffsets = offsets.slice(i, i + BATCH_SIZE);
        const queuedCmds = await Promise.all(
          batchOffsets.map((off) =>
            devices.sendCommand(this.deviceId, {
              commandType: 'run_script',
              payload: {
                script: this.buildDownloadChunkScript(path, off, AGENT_DL_CHUNK),
                shell
              }
            })
          )
        );
        const batchResults = await Promise.all(
          queuedCmds.map(async (cmd) => {
            const out = await this.waitCommand(cmd.id, 60_000, signal);
            const parsed = this.parseDownloadChunkOutput(path, out);
            received += parsed.bytes.length;
            onProgress?.(Math.min(received, totalSize), totalSize);
            return parsed.bytes;
          })
        );
        chunks.push(...batchResults);
      }

      const out = new Uint8Array(received);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      return out;
    });
  }

  private buildUploadChunkScript(path: string, mode: 'w' | 'a', b64: string): string {
    if (this.os === 'windows') {
      const fileMode = mode === 'a' ? '[System.IO.FileMode]::Append' : '[System.IO.FileMode]::Create';
      return [
        "$ErrorActionPreference = 'Stop'",
        `$p = ${psQuote(path)}`,
        "try {",
        `  $bytes = [Convert]::FromBase64String('${b64}')`,
        `  $fs = [System.IO.File]::Open($p, ${fileMode}, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)`,
        "  try { if ($bytes.Length -gt 0) { $fs.Write($bytes, 0, $bytes.Length) } } finally { $fs.Dispose() }",
        "  Write-Output '__APEX_UL__OK__END_UL__'",
        "} catch {",
        "  Write-Output \"__APEX_UL__ERR:$($_.Exception.Message)__END_UL__\"",
        "}"
      ].join('\n');
    }

    return [
      `perl -MMIME::Base64 -e '`,
      `  my ($p, $m) = @ARGV;`,
      `  local $/; my $b64 = <STDIN>;`,
      `  open(my $fh, $m eq "a" ? ">>:raw" : ">:raw", $p) or do { print "__APEX_UL__ERR:$!__END_UL__"; exit 0; };`,
      `  print $fh decode_base64($b64);`,
      `  close($fh) or do { print "__APEX_UL__ERR:$!__END_UL__"; exit 0; };`,
      `  print "__APEX_UL__OK__END_UL__";`,
      `' -- ${shQuote(path)} '${mode}' <<'__APEX_EOF__'`,
      b64,
      `__APEX_EOF__`
    ].join('\n');
  }

  upload(path: string, data: Blob, onProgress?: Progress, signal?: AbortSignal): Promise<void> {
    return this.enqueue(async () => {
      if (signal?.aborted) throw new TransferCancelled();
      const total = data.size;
      const chunkSize = this.os === 'windows' ? AGENT_UL_CHUNK_WIN : AGENT_UL_CHUNK_POSIX;
      const shell = this.os === 'windows' ? 'powershell' : 'bash';

      if (total === 0) {
        const out = await this.runScript(this.buildUploadChunkScript(path, 'w', ''), 45_000, signal);
        if (!out.includes('__APEX_UL__OK__END_UL__')) {
          const errMatch = out.match(/__APEX_UL__ERR:([\s\S]*?)__END_UL__/);
          throw new Error(`The device could not write "${path}": ${errMatch ? errMatch[1] : 'access denied'}`);
        }
        onProgress?.(0, 0);
        return;
      }

      const slices: { offset: number; end: number; mode: 'w' | 'a' }[] = [];
      for (let off = 0; off < total; off += chunkSize) {
        slices.push({
          offset: off,
          end: Math.min(off + chunkSize, total),
          mode: off === 0 ? 'w' : 'a'
        });
      }

      let doneBytes = 0;
      const BATCH_SIZE = 4;
      for (let i = 0; i < slices.length; i += BATCH_SIZE) {
        if (signal?.aborted) throw new TransferCancelled();
        const batch = slices.slice(i, i + BATCH_SIZE);
        // Enqueue commands sequentially in strict order so the agent executes w then a, a, a...
        const queued: { id: string; size: number }[] = [];
        for (const s of batch) {
          if (signal?.aborted) throw new TransferCancelled();
          const bytes = new Uint8Array(await data.slice(s.offset, s.end).arrayBuffer());
          const b64 = bytesToBase64(bytes);
          const cmd = await devices.sendCommand(this.deviceId, {
            commandType: 'run_script',
            payload: {
              script: this.buildUploadChunkScript(path, s.mode, b64),
              shell
            }
          });
          queued.push({ id: cmd.id, size: s.end - s.offset });
        }

        await Promise.all(
          queued.map(async (q) => {
            const out = await this.waitCommand(q.id, 60_000, signal);
            if (!out.includes('__APEX_UL__OK__END_UL__')) {
              const errMatch = out.match(/__APEX_UL__ERR:([\s\S]*?)__END_UL__/);
              throw new Error(`The device could not write "${path}": ${errMatch ? errMatch[1] : 'check permissions'}`);
            }
            doneBytes += q.size;
            onProgress?.(Math.min(doneBytes, total), total);
          })
        );
      }
    });
  }
}
