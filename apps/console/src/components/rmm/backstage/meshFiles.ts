import { mesh } from '../../../services/api';

/**
 * MeshFileChannel — file upload/download over MeshCentral's file relay
 * (meshrelay protocol 5), the same channel MeshCentral's own Files tab uses.
 * ---------------------------------------------------------------------------
 * Message shapes follow agents/meshcore.js:
 *   download: → {action:'download', sub:'start', id, path}
 *             ← {action:'download', sub:'start'|'cancel', id}
 *             → {sub:'startack'} then one {sub:'ack'} per block received
 *             ← binary blocks: [u32 flags][data], flags 0x01000001 = last block
 *   upload:   → {action:'upload', reqid, path}       ← {action:'uploadstart'|'uploaderror'}
 *             → binary blocks (prefixed with 0x00 when they start with 0x00 or '{')
 *             ← {action:'uploadack'} per block
 *             → {action:'uploaddone'}                ← {action:'uploaddone'}
 * Agent replies arrive as text or as binary frames holding JSON; binary frames
 * starting with '{' are JSON, everything else during a download is file data.
 * Only one transfer runs at a time; callers are queued.
 */

const PROTOCOL_FILES = 5;
const UPLOAD_BLOCK = 32 * 1024;
const UPLOAD_WINDOW = 4;      // blocks in flight before waiting for acks
const DOWNLOAD_WINDOW = 4;    // blocks requested ahead
const LAST_BLOCK_FLAG = 0x01000001;

export type Progress = (done: number, total: number | null) => void;

interface JsonMsg { action?: string; sub?: string; id?: number; reqid?: number; [k: string]: unknown }

type Handler = {
  onJson: (msg: JsonMsg) => void;
  onBinary: (data: Uint8Array) => void;
  onClose: (reason: string) => void;
};

export class TransferCancelled extends Error {
  constructor() { super('Transfer cancelled.'); }
}

export class MeshFileChannel {
  private ws: WebSocket;
  private handler: Handler | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  closed = false;

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

  /** Opens a file relay to the device and resolves once the agent is attached. */
  static open(deviceId: string): Promise<MeshFileChannel> {
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
    if (msg && msg.action) this.handler?.onJson(msg);
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

  /** Downloads one file. `signal` aborts the transfer. */
  download(path: string, onProgress?: Progress, signal?: AbortSignal, expectedSize?: number): Promise<Uint8Array<ArrayBuffer>> {
    return this.enqueue(() => new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const id = this.nextId++;
      const chunks: Uint8Array[] = [];
      let received = 0;
      // Blocks carry no id. Anything that arrives before our 'start' reply is a
      // leftover from a cancelled download that was already in flight.
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
      let offset = 0;     // next byte to read from `data`
      let acked = 0;      // blocks the agent has written
      let sent = 0;       // blocks sent
      let reading = false;
      let doneSent = false;

      const finish = (err?: Error) => {
        this.handler = null;
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err); else resolve();
      };
      const onAbort = () => {
        // Closing the file on the agent leaves a partial file; say so in the error.
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
