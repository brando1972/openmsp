import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X, TerminalSquare, Loader2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { net, type NetHost } from '../../services/api';

/**
 * In-browser SSH terminal that reaches a discovered device through the site
 * collector's tunnel. The SSH protocol is terminated on the collector (on the
 * LAN); this component only streams plaintext terminal bytes over the data-plane
 * WebSocket. Credentials are entered here, sent once over the (WSS) socket, and
 * never persisted anywhere.
 */

type Phase = 'form' | 'connecting' | 'connected' | 'closed' | 'error';

const nameOf = (h: NetHost) =>
  h.hostname || h.sysName || h.vendor || h.ips?.[0] || h.mac || 'device';

export const SshTerminal: React.FC<{ host: NetHost; siteId: string; onClose: () => void }> = ({ host, siteId, onClose }) => {
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');

  const termHostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ip = host.ips?.[0] || '';

  const teardown = useCallback(() => {
    try { wsRef.current?.close(); } catch { /* noop */ }
    wsRef.current = null;
    try { termRef.current?.dispose(); } catch { /* noop */ }
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Fit the terminal to its container once it becomes visible, and on resize.
  useEffect(() => {
    if (phase !== 'connected') return;
    const doFit = () => {
      try {
        fitRef.current?.fit();
        const t = termRef.current;
        if (t && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ t: 'resize', cols: t.cols, rows: t.rows }));
        }
      } catch { /* noop */ }
    };
    // The terminal host is now committed and visible — fit for real.
    const t1 = setTimeout(doFit, 30);
    const t2 = setTimeout(doFit, 150);
    window.addEventListener('resize', doFit);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', doFit); };
  }, [phase]);

  const connect = async () => {
    setError('');
    if (!ip) { setError('This device has no reachable IP.'); return; }
    if (!username.trim()) { setError('A username is required.'); return; }
    setPhase('connecting');
    let open;
    try {
      open = await net.openSSH({ ip, siteId });
    } catch {
      setError('Could not reach the control plane to open a session.');
      setPhase('error');
      return;
    }
    if (!open.ready || !open.wsUrl) {
      setError(open.reason || 'The site collector must be online to open an SSH session.');
      setPhase('error');
      return;
    }

    const ws = new WebSocket(open.wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      // Spin up the terminal, then authenticate + open the remote shell.
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        theme: { background: '#0b1220', foreground: '#e2e8f0', cursor: '#818cf8' }
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      termRef.current = term;
      fitRef.current = fit;
      setPhase('connected');
      // Defer open until the terminal host is in the DOM.
      requestAnimationFrame(() => {
        if (!termHostRef.current) return;
        term.open(termHostRef.current);
        try { fit.fit(); } catch { /* noop */ }
        term.focus();
        term.writeln('\x1b[90mConnecting to ' + ip + ' …\x1b[0m');

        ws.send(JSON.stringify({
          t: 'auth',
          username: username.trim(),
          password: authMode === 'password' ? password : undefined,
          privateKey: authMode === 'key' ? privateKey : undefined,
          passphrase: authMode === 'key' && passphrase ? passphrase : undefined,
          cols: term.cols,
          rows: term.rows
        }));

        // Keystrokes → binary frames.
        term.onData((d) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d));
        });
        term.onResize(({ cols, rows }) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'resize', cols, rows }));
        });
      });
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'ready') {
          termRef.current?.writeln('\x1b[92m✓ connected\x1b[0m\r');
        } else if (m.t === 'error') {
          termRef.current?.writeln('\r\n\x1b[91m✗ ' + (m.msg || 'session error') + '\x1b[0m');
          setError(m.msg || 'Session error.');
        } else if (m.t === 'close') {
          termRef.current?.writeln('\r\n\x1b[90m— session closed —\x1b[0m');
          setPhase('closed');
        }
        return;
      }
      // Binary → terminal output.
      const bytes = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
      if (bytes) termRef.current?.write(bytes);
    };

    ws.onclose = () => {
      setPhase((p) => (p === 'connected' ? 'closed' : p));
    };
    ws.onerror = () => {
      setError('The tunnel connection failed.');
      setPhase('error');
    };
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-[#0b1220]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* title bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-slate-800 border-b border-slate-700">
          <TerminalSquare className="w-4 h-4 text-indigo-300" />
          <div className="text-sm font-semibold text-slate-100">SSH · {nameOf(host)}</div>
          <div className="text-[11px] text-slate-400 font-mono">{ip}</div>
          {phase === 'connected' && <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> live</span>}
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>

        {/* body */}
        {phase === 'form' || phase === 'connecting' || phase === 'error' ? (
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="w-full max-w-sm flex flex-col gap-3">
              <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold mb-1">
                <ShieldCheck className="w-4 h-4 text-indigo-400" /> Authenticate to {nameOf(host)}
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">
                Credentials go straight to the site collector over the tunnel and are never stored.
              </p>

              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Username</label>
              <input
                value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
                name="apex-ssh-user" autoComplete="off" data-1p-ignore data-lpignore="true"
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                placeholder="admin"
              />

              <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                <button onClick={() => setAuthMode('password')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1.5 ${authMode === 'password' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>
                  <Lock className="w-3.5 h-3.5" /> Password
                </button>
                <button onClick={() => setAuthMode('key')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1.5 ${authMode === 'key' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>
                  <KeyRound className="w-3.5 h-3.5" /> Private key
                </button>
              </div>

              {authMode === 'password' ? (
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
                  name="apex-ssh-secret" autoComplete="new-password" data-1p-ignore data-lpignore="true"
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                  placeholder="Password"
                />
              ) : (
                <>
                  <textarea
                    value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                    rows={4}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-400 resize-none"
                    placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…'}
                  />
                  <input
                    type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                    name="apex-ssh-passphrase" autoComplete="new-password" data-1p-ignore data-lpignore="true"
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                    placeholder="Key passphrase (optional)"
                  />
                </>
              )}

              {error && <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">{error}</div>}

              <button
                onClick={connect} disabled={phase === 'connecting'}
                className="mt-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 disabled:opacity-60"
              >
                {phase === 'connecting' ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</> : <>Connect</>}
              </button>
            </div>
          </div>
        ) : null}

        {/* terminal surface — always mounted once we leave the form so the ref exists */}
        <div className={`flex-1 min-h-0 bg-[#0b1220] px-2 py-1 ${phase === 'connected' || phase === 'closed' ? '' : 'hidden'}`}>
          <div ref={termHostRef} className="w-full h-full" />
        </div>

        {phase === 'closed' && (
          <div className="shrink-0 px-4 py-2 bg-slate-800 border-t border-slate-700 text-center">
            <button onClick={onClose} className="text-xs font-semibold text-slate-300 hover:text-white">Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SshTerminal;
