import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, X, RefreshCw, Maximize2, Keyboard, Loader2, AlertTriangle, Wifi } from 'lucide-react';
import { mesh, type MeshSession } from '../../services/api';

/**
 * ApexConnectDesktop — native remote-desktop viewer.
 * ---------------------------------------------------------------------------
 * Renders a device's live desktop inside the ApexMSP console with ZERO
 * MeshCentral UI. It opens a raw meshrelay WebSocket (auth cookie minted
 * server-side) and speaks MeshCentral's KVM desktop protocol directly:
 * decoding JPEG tiles onto a <canvas> and sending mouse/keyboard input.
 *
 * Protocol (big-endian [type u16][size u16] framed; size incl. 4-byte header):
 *   in   7 = screen size (w@4, h@6)      3 = tile (x@4, y@6, jpeg@8)
 *        27 = jumbo wrapper (realsize u32 @4, inner command @8)
 *   out  5 = compression   6 = refresh   8 = (un)pause
 *        1 = key(VK)  85 = key(unicode)  2 = mouse  10 = ctrl-alt-del
 * Handshake: server sends 'c'/'cr' → we send protocol "2" → binary stream.
 */

type Phase = 'requesting' | 'connecting' | 'live' | 'error' | 'closed';

interface Props {
  deviceId?: string;
  nodeid?: string;
  deviceName: string;
  clientName?: string;
  onClose: () => void;
}

// KeyAction: DOWN=1, UP=2 (MeshCentral). Unicode path uses (action-1).
const KEY_DOWN = 1;
const KEY_UP = 2;

// JS keyCode -> Windows virtual-key code is identity for the keys we map here.
const isPrintable = (key: string) => key.length === 1;

export const ApexConnectDesktop: React.FC<Props> = ({ deviceId, nodeid, deviceName, clientName, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef({ handshook: false });
  const accRef = useRef<Uint8Array>(new Uint8Array(0));
  const screenRef = useRef({ w: 0, h: 0 });

  const [phase, setPhase] = useState<Phase>('requesting');
  const [message, setMessage] = useState('Requesting session…');
  const [session, setSession] = useState<MeshSession | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ---- outgoing helpers ----
  const send = useCallback((bytes: number[]) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(new Uint8Array(bytes)); } catch { /* ignore */ }
    }
  }, []);

  const sendStartup = useCallback(() => {
    // compression: type=1 JPEG, level=50, scaling=1024, frametimer=100ms
    send([0x00, 0x05, 0x00, 0x0a, 0x01, 0x32, 0x04, 0x00, 0x00, 0x64]);
    send([0x00, 0x08, 0x00, 0x05, 0x00]); // unpause
    send([0x00, 0x06, 0x00, 0x04]);       // refresh
  }, [send]);

  // ---- incoming command handling ----
  const drawTile = useCallback((x: number, y: number, jpeg: Uint8Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const copy = jpeg.slice();
    const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'image/jpeg' });
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(blob).then((bmp) => { ctx.drawImage(bmp, x, y); bmp.close?.(); }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, x, y); URL.revokeObjectURL(url); };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    }
  }, []);

  const processCommand = useCallback((cmd: number, view: Uint8Array) => {
    if (cmd === 7) {
      // screen size
      const w = (view[4] << 8) + view[5];
      const h = (view[6] << 8) + view[7];
      if (w > 0 && h > 0) {
        screenRef.current = { w, h };
        const canvas = canvasRef.current;
        if (canvas && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
        }
        setPhase('live');
      }
    } else if (cmd === 3) {
      // tile: x@4, y@6, jpeg@8
      const x = (view[4] << 8) + view[5];
      const y = (view[6] << 8) + view[7];
      if (view.length > 8) drawTile(x, y, view.subarray(8));
    }
    // other commands (copy/cursor/displays/keystate) are non-essential for view+control
  }, [drawTile]);

  const feed = useCallback((chunk: Uint8Array) => {
    // append to accumulator
    let buf: Uint8Array;
    const prev = accRef.current;
    if (prev.length === 0) {
      buf = chunk;
    } else {
      buf = new Uint8Array(prev.length + chunk.length);
      buf.set(prev, 0);
      buf.set(chunk, prev.length);
    }
    let off = 0;
    while (buf.length - off >= 4) {
      const type = (buf[off] << 8) + buf[off + 1];
      let size = (buf[off + 2] << 8) + buf[off + 3];
      if (type === 27) {
        // jumbo: realsize u32 @ off+4, inner command @ off+8
        if (buf.length - off < 8) break;
        const realsize =
          (buf[off + 4] * 0x1000000) + (buf[off + 5] << 16) + (buf[off + 6] << 8) + buf[off + 7];
        const total = realsize + 8;
        if (buf.length - off < total) break;
        const inner = buf.subarray(off + 8, off + total);
        const innerCmd = (inner[0] << 8) + inner[1];
        processCommand(innerCmd, inner);
        off += total;
        continue;
      }
      if (size < 4) { size = 4; } // guard against malformed; skip header
      if (buf.length - off < size) break;
      processCommand(type, buf.subarray(off, off + size));
      off += size;
    }
    accRef.current = off > 0 ? buf.subarray(off) : buf;
  }, [processCommand]);

  // ---- connection lifecycle ----
  const cleanup = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) { try { ws.onmessage = null; ws.onclose = null; ws.close(); } catch { /* ignore */ } }
    accRef.current = new Uint8Array(0);
    stateRef.current.handshook = false;
  }, []);

  const openRelay = useCallback((s: MeshSession) => {
    setPhase('connecting');
    setMessage(`Connecting to ${s.deviceName}…`);
    const sep = s.relayUrl.includes('?') ? '&' : '?';
    const url =
      `${s.relayUrl}${sep}browser=1&p=${s.protocol}&nodeid=${encodeURIComponent(s.nodeid)}` +
      `&id=${encodeURIComponent(s.tunnelid)}` + (s.auth ? `&auth=${encodeURIComponent(s.auth)}` : '');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Failed to open relay');
      return;
    }
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        if (!stateRef.current.handshook && (ev.data === 'c' || ev.data === 'cr')) {
          stateRef.current.handshook = true;
          try { ws.send(String(s.protocol)); } catch { /* ignore */ }
          sendStartup();
          setMessage('Negotiating desktop…');
        }
        return;
      }
      if (ev.data instanceof ArrayBuffer) feed(new Uint8Array(ev.data));
    };
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setPhase((p) => (p === 'live' || p === 'connecting' ? 'closed' : p));
        setMessage('Session ended.');
      }
    };
    ws.onerror = () => { /* surfaced via onclose */ };
  }, [feed, sendStartup]);

  const start = useCallback(async () => {
    cleanup();
    setPhase('requesting');
    setMessage('Requesting session…');
    try {
      const s = await mesh.startSession({ deviceId, nodeid });
      setSession(s);
      if (!s.online) setMessage(`${s.deviceName} appears offline — trying anyway…`);
      openRelay(s);
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Could not start remote session');
    }
  }, [cleanup, deviceId, nodeid, openRelay]);

  useEffect(() => {
    start();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // ---- input ----
  const toScreen = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const { w, h } = screenRef.current;
    if (!canvas || !w || !h) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    let x = Math.round((clientX - rect.left) * (w / rect.width));
    let y = Math.round((clientY - rect.top) * (h / rect.height));
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    return { x, y };
  }, []);

  const sendMouse = useCallback((clientX: number, clientY: number, button: number) => {
    const pt = toScreen(clientX, clientY);
    if (!pt) return;
    send([0x00, 0x02, 0x00, 0x0a, 0x00, button & 0xff, (pt.x >> 8) & 0xff, pt.x & 0xff, (pt.y >> 8) & 0xff, pt.y & 0xff]);
  }, [send, toScreen]);

  const btnDown = (b: number) => (b === 0 ? 0x02 : b === 2 ? 0x08 : 0x20);
  const btnUp = (b: number) => (b === 0 ? 0x04 : b === 2 ? 0x10 : 0x40);

  const sendKey = useCallback((action: number, vk: number) => {
    send([0x00, 0x01, 0x00, 0x06, action, vk & 0xff]);
  }, [send]);
  const sendUnicode = useCallback((action: number, code: number) => {
    send([0x00, 0x55, 0x00, 0x07, action - 1, (code >> 8) & 0xff, code & 0xff]);
  }, [send]);
  const sendCtrlAltDel = useCallback(() => { send([0x00, 0x0a, 0x00, 0x04]); }, [send]);

  useEffect(() => {
    if (phase !== 'live') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'v') return; // let paste pass to allow future clipboard
      e.preventDefault();
      if (isPrintable(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        sendUnicode(KEY_DOWN, e.key.charCodeAt(0));
      } else if (e.keyCode) {
        sendKey(KEY_DOWN, e.keyCode);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      if (isPrintable(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        sendUnicode(KEY_UP, e.key.charCodeAt(0));
      } else if (e.keyCode) {
        sendKey(KEY_UP, e.keyCode);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [phase, sendKey, sendUnicode]);

  const goFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const statusPill = () => {
    if (phase === 'live') return <span className="flex items-center gap-1.5 text-emerald-400"><Wifi className="w-3.5 h-3.5" /> Live</span>;
    if (phase === 'error') return <span className="flex items-center gap-1.5 text-red-400"><AlertTriangle className="w-3.5 h-3.5" /> Error</span>;
    if (phase === 'closed') return <span className="flex items-center gap-1.5 text-slate-400">Disconnected</span>;
    return <span className="flex items-center gap-1.5 text-amber-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting</span>;
  };

  const busy = phase === 'requesting' || phase === 'connecting';

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div
        ref={containerRef}
        className="relative w-full h-full sm:h-[92vh] sm:max-w-[1400px] bg-[#0b0e14] sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col"
      >
        {/* ApexConnect chrome — top bar */}
        <div className="h-12 shrink-0 bg-[#10141c] border-b border-slate-800 flex items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">{deviceName}</div>
              <div className="text-[11px] text-slate-400 truncate leading-tight">
                {clientName ? `${clientName} · ` : ''}ApexConnect remote desktop
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:flex text-[11px] font-semibold mr-1">{statusPill()}</span>
            <button
              onClick={sendCtrlAltDel}
              disabled={phase !== 'live'}
              title="Send Ctrl+Alt+Del"
              className="h-8 px-2.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Keyboard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ctrl+Alt+Del</span>
            </button>
            <button onClick={goFullscreen} title="Fullscreen" className="h-8 w-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={() => setAttempt((a) => a + 1)} title="Reconnect" className="h-8 w-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => { cleanup(); onClose(); }} title="Close" className="h-8 w-8 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-300 flex items-center justify-center transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Desktop surface */}
        <div className="flex-1 min-h-0 bg-black relative flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`max-w-full max-h-full ${phase === 'live' ? 'cursor-none' : 'opacity-0'}`}
            style={{ imageRendering: 'auto', objectFit: 'contain' }}
            onMouseMove={(e) => phase === 'live' && sendMouse(e.clientX, e.clientY, 0x00)}
            onMouseDown={(e) => { if (phase === 'live') { e.preventDefault(); sendMouse(e.clientX, e.clientY, btnDown(e.button)); } }}
            onMouseUp={(e) => { if (phase === 'live') { e.preventDefault(); sendMouse(e.clientX, e.clientY, btnUp(e.button)); } }}
            onContextMenu={(e) => e.preventDefault()}
          />

          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <div className="text-sm font-semibold">{message}</div>
            </div>
          )}

          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle className="w-9 h-9 text-amber-400" />
              <div className="text-sm font-semibold text-white max-w-md">{message}</div>
              <button onClick={() => setAttempt((a) => a + 1)} className="mt-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
                Try again
              </button>
            </div>
          )}

          {phase === 'closed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Monitor className="w-9 h-9 text-slate-500" />
              <div className="text-sm font-semibold text-slate-300">{message}</div>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => setAttempt((a) => a + 1)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Reconnect</button>
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApexConnectDesktop;
