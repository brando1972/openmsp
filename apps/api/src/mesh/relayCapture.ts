import { WebSocket } from 'ws';
import sharp from 'sharp';

/**
 * Server-side desktop screenshot for relay/VNC devices (Android tablets).
 * ---------------------------------------------------------------------------
 * The API connects to the ApexMSP VNC relay as a viewer, speaks minimal RFB
 * (VNC) to the device's droidVNC agent, grabs ONE framebuffer, and composites
 * a JPEG thumbnail with sharp. Cached per device. Mirrors the MeshCentral KVM
 * thumbnail path so tablet cards get the same auto-refreshing preview.
 *
 * Probed against the live tablet: RFB 003.008, security = None (1),
 * 32bpp true-colour, byte order [R,G,B,X].
 */

interface ThumbEntry { buf: Buffer; ts: number; }
const cache = new Map<string, ThumbEntry>();
const capturing = new Set<string>();

export function getRelayThumb(device: string): ThumbEntry | null {
  return cache.get(device) || null;
}

/** Capture a fresh screenshot for a relay device. Returns cached on failure. */
export async function captureRelayThumb(wsBase: string, device: string, token: string): Promise<ThumbEntry | null> {
  if (capturing.has(device)) return cache.get(device) || null;
  capturing.add(device);
  try {
    const frame = await grabFrame(wsBase, device, token);
    if (frame) {
      const jpeg = await sharp(frame.rgb, { raw: { width: frame.w, height: frame.h, channels: 3 } })
        .resize({ width: 640, withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer();
      const entry = { buf: jpeg, ts: Date.now() };
      cache.set(device, entry);
      return entry;
    }
  } catch { /* fall through */ }
  finally { capturing.delete(device); }
  return cache.get(device) || null;
}

function grabFrame(wsBase: string, device: string, token: string): Promise<{ w: number; h: number; rgb: Buffer } | null> {
  return new Promise((resolve) => {
    const sep = wsBase.includes('?') ? '&' : '?';
    const url = `${wsBase}${sep}device=${encodeURIComponent(device)}&t=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try { ws = new WebSocket(url, 'binary'); } catch { resolve(null); return; }

    let acc = Buffer.alloc(0);
    let state = 0; // 0 version, 1 sec-list, 2 sec-result, 3 serverinit, 4 reading update
    let W = 0, H = 0, nameLen = 0;
    let rgb: Buffer | null = null;
    let rectsLeft = 0;
    let inUpdate = false;
    // current rect being read
    let rx = 0, ry = 0, rw = 0, rh = 0, needRectHeader = true, rectBytes = 0;
    let done = false;

    const finish = (ok: boolean) => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(ok && rgb ? { w: W, h: H, rgb } : null);
    };
    const timer = setTimeout(() => finish(false), 12000);
    const send = (a: number[]) => { try { ws.send(Buffer.from(a)); } catch { /* ignore */ } };

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return; // relay only pipes binary RFB
      acc = acc.length ? Buffer.concat([acc, data]) : Buffer.from(data);
      pump();
    });
    ws.on('close', () => finish(!!rgb));
    ws.on('error', () => finish(false));

    function pump() {
      // 0: server protocol version (12 bytes) -> reply with 3.8
      if (state === 0) {
        if (acc.length < 12) return;
        acc = acc.subarray(12);
        send([...Buffer.from('RFB 003.008\n')]);
        state = 1;
      }
      // 1: security types [count][types...] -> pick None (1)
      if (state === 1) {
        if (acc.length < 1) return;
        const cnt = acc[0];
        if (acc.length < 1 + cnt) return;
        const types = acc.subarray(1, 1 + cnt);
        acc = acc.subarray(1 + cnt);
        if (!types.includes(1)) { finish(false); return; } // only None is handled
        send([1]);
        state = 2;
      }
      // 2: SecurityResult (u32) -> ClientInit(shared=1)
      if (state === 2) {
        if (acc.length < 4) return;
        const res = acc.readUInt32BE(0);
        acc = acc.subarray(4);
        if (res !== 0) { finish(false); return; }
        send([1]);
        state = 3;
      }
      // 3: ServerInit (24 + nameLen) -> SetEncodings(Raw) + FramebufferUpdateRequest(full)
      if (state === 3) {
        if (acc.length < 24) return;
        W = acc.readUInt16BE(0); H = acc.readUInt16BE(2);
        nameLen = acc.readUInt32BE(20);
        if (acc.length < 24 + nameLen) return;
        acc = acc.subarray(24 + nameLen);
        if (W <= 0 || H <= 0 || W > 8000 || H > 8000) { finish(false); return; }
        rgb = Buffer.alloc(W * H * 3);
        send([2, 0, 0, 1, 0, 0, 0, 0]); // SetEncodings: Raw only
        send([3, 0, 0, 0, 0, 0, (W >> 8) & 0xff, W & 0xff, (H >> 8) & 0xff, H & 0xff]); // full update request
        state = 4;
      }
      // 4: FramebufferUpdate — wait for the update to actually arrive, then decode it.
      if (state === 4) {
        if (!inUpdate) {
          // skip any non-FramebufferUpdate server messages (defensive; none expected in true-colour)
          while (acc.length >= 1 && acc[0] !== 0) acc = acc.subarray(1);
          if (acc.length < 4) return;            // [msgtype=0][pad][numRects u16] — wait for it
          rectsLeft = acc.readUInt16BE(2);
          acc = acc.subarray(4);
          inUpdate = true;
          if (rectsLeft === 0) { finish(true); return; }
        }
        while (rectsLeft > 0) {
          if (needRectHeader) {
            if (acc.length < 12) return;
            rx = acc.readUInt16BE(0); ry = acc.readUInt16BE(2);
            rw = acc.readUInt16BE(4); rh = acc.readUInt16BE(6);
            const enc = acc.readInt32BE(8);
            acc = acc.subarray(12);
            if (enc !== 0) { finish(false); return; } // advertised Raw only; bail on anything else
            rectBytes = rw * rh * 4;
            needRectHeader = false;
          }
          if (acc.length < rectBytes) return; // wait for the rest of the rect
          const px = acc.subarray(0, rectBytes);
          acc = acc.subarray(rectBytes);
          if (rgb) {
            for (let r = 0; r < rh; r++) {
              const gy = ry + r;
              if (gy < 0 || gy >= H) continue;
              let s = r * rw * 4;
              let d = (gy * W + rx) * 3;
              for (let c = 0; c < rw; c++, s += 4, d += 3) {
                if (rx + c >= W) continue;
                rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2];
              }
            }
          }
          needRectHeader = true;
          rectsLeft--;
        }
        finish(true); return;
      }
    }
  });
}
