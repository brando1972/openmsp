import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Terminal as TerminalIcon,
  Play,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  Zap,
  Radio,
  AlertCircle,
  Wifi,
  WifiOff,
  User,
  Globe,
  Shield
} from 'lucide-react';
import { ManagedDevice } from '../../types';
import { mesh, MeshSession } from '../../services/api';

interface DeviceTerminalProps {
  device: ManagedDevice;
  initialShell?: 'powershell' | 'cmd' | 'bash';
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export const DeviceTerminal: React.FC<DeviceTerminalProps> = ({
  device,
  initialShell,
  isExpanded,
  onToggleExpand
}) => {
  const isWindows = device.os === 'windows';
  const defaultShell: 'powershell' | 'cmd' | 'bash' = initialShell
    ? initialShell
    : isWindows
    ? 'powershell'
    : 'bash';

  const [activeShell, setActiveShell] = useState<'powershell' | 'cmd' | 'bash'>(defaultShell);
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [statusMessage, setStatusMessage] = useState<string>('Initializing live session…');
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);

  // Command history for bottom input field
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);

  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine protocol number:
  // 6 = PowerShell (Windows)
  // 1 = Terminal (CMD on Windows, Bash on Linux/Mac)
  const getProtocol = (shell: 'powershell' | 'cmd' | 'bash'): number => {
    if (shell === 'powershell') return 6;
    return 1;
  };

  // Resize notification to agent
  const sendResize = useCallback(() => {
    const term = termRef.current;
    const ws = wsRef.current;
    if (term && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          JSON.stringify({
            ctrlChannel: '102938',
            type: 'termsize',
            cols: term.cols,
            rows: term.rows
          })
        );
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Teardown previous session
  const teardown = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
      fitRef.current = null;
    }
  }, []);

  // Connect to live session
  const connectSession = useCallback(async (shellType: 'powershell' | 'cmd' | 'bash') => {
    teardown();
    setStatus('connecting');
    setStatusMessage(`Connecting to ${device.name} via ApexConnect…`);

    const protocol = getProtocol(shellType);

    let session: MeshSession;
    try {
      session = await mesh.startSession({
        deviceId: device.id,
        protocol
      });
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(err?.message || 'Failed to initialize live terminal session.');
      return;
    }

    if (!session || !session.relayUrl) {
      setStatus('error');
      setStatusMessage('Invalid session received from server.');
      return;
    }

    // Set up xterm instance
    if (!termContainerRef.current) return;
    termContainerRef.current.innerHTML = '';

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#0a0e17',
        foreground: '#e2e8f0',
        cursor: shellType === 'powershell' ? '#38bdf8' : '#f59e0b',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
        brightBlack: '#475569',
        red: '#f87171',
        brightRed: '#fca5a5',
        green: '#4ade80',
        brightGreen: '#86efac',
        yellow: '#facc15',
        brightYellow: '#fde047',
        blue: '#60a5fa',
        brightBlue: '#93c5fd',
        magenta: '#c084fc',
        brightMagenta: '#d8b4fe',
        cyan: '#38bdf8',
        brightCyan: '#7dd3fc',
        white: '#f8fafc',
        brightWhite: '#ffffff'
      }
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Connect WebSocket
    const sep = session.relayUrl.includes('?') ? '&' : '?';
    const wsUrl =
      `${session.relayUrl}${sep}browser=1&p=${session.protocol}&nodeid=${encodeURIComponent(session.nodeid)}` +
      `&id=${encodeURIComponent(session.tunnelid)}` +
      (session.auth ? `&auth=${encodeURIComponent(session.auth)}` : '');

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
    } catch (err: any) {
      setStatus('error');
      setStatusMessage('WebSocket connection error: ' + err.message);
      return;
    }

    let handshook = false;
    const encoder = new TextEncoder();

    ws.onopen = () => {
      setStatusMessage('Authenticating session…');
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        if (!handshook && (ev.data === 'c' || ev.data === 'cr')) {
          handshook = true;
          // Reply with protocol number
          try {
            ws.send(String(session.protocol));
            // Send terminal size
            ws.send(
              JSON.stringify({
                ctrlChannel: '102938',
                type: 'termsize',
                cols: term.cols,
                rows: term.rows
              })
            );
          } catch {
            /* ignore */
          }
          setStatus('connected');
          setStatusMessage('Live');
          term.focus();

          // Suppress Windows PowerShell promotional banner (-NoLogo effect)
          if (session.protocol === 6) {
            setTimeout(() => {
              try {
                ws.send('Clear-Host\r\n');
              } catch {
                /* ignore */
              }
            }, 350);
          }
          return;
        }

        // Check for MeshCentral control messages
        if (ev.data.startsWith('{')) {
          try {
            const parsed = JSON.parse(ev.data);
            if (parsed.ctrlChannel === '102938' || parsed.ctrlChannel === 102938) {
              return;
            }
          } catch {
            /* not JSON, treat as text */
          }
        }

        term.write(ev.data);
        return;
      }

      if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        setStatus('disconnected');
        setStatusMessage('Session disconnected');
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setStatusMessage('Connection error occurred');
    };

    // User typing in the xterm terminal -> send straight over WebSocket
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(data));
      }
    });
  }, [device.id, device.name, teardown]);

  // Initial connect and reconnect on shell switch
  useEffect(() => {
    connectSession(activeShell);
    return () => teardown();
  }, [activeShell, connectSession, teardown]);

  // Refit terminal on container size change or expand toggle
  useEffect(() => {
    const handleResize = () => {
      try {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit();
          sendResize();
        }
      } catch {
        /* ignore */
      }
    };

    const t1 = setTimeout(handleResize, 50);
    const t2 = setTimeout(handleResize, 250);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
    };
  }, [isExpanded, sendResize]);

  // Send a raw command string to the live session
  const sendCommandText = (cmd: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = new TextEncoder();
    ws.send(encoder.encode(cmd + '\r\n'));
    termRef.current?.focus();
  };

  const handleInputSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputValue.trim();
    if (!cmd) return;

    setCommandHistory(prev => [cmd, ...prev.filter(c => c !== cmd)]);
    setHistoryPointer(-1);
    sendCommandText(cmd);
    setInputValue('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex = Math.min(historyPointer + 1, commandHistory.length - 1);
      setHistoryPointer(nextIndex);
      setInputValue(commandHistory[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyPointer > 0) {
        const nextIndex = historyPointer - 1;
        setHistoryPointer(nextIndex);
        setInputValue(commandHistory[nextIndex]);
      } else if (historyPointer === 0) {
        setHistoryPointer(-1);
        setInputValue('');
      }
    } else if (e.key === 'Escape') {
      setInputValue('');
    }
  };

  const handleClear = () => {
    termRef.current?.clear();
    termRef.current?.focus();
  };

  const handleCopySelection = () => {
    const term = termRef.current;
    if (!term) return;
    const sel = term.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // If nothing selected, prompt user
      term.selectAll();
      const all = term.getSelection();
      navigator.clipboard.writeText(all);
      term.clearSelection();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Quick preset snippets based on current shell
  const quickSnippets = isWindows
    ? activeShell === 'powershell'
      ? [
          { label: 'Get-Process', cmd: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10' },
          { label: 'Get-Service', cmd: 'Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 10' },
          { label: 'IP Config', cmd: 'Get-NetIPAddress | Where-Object AddressFamily -eq "IPv4" | Format-Table' },
          { label: 'System Info', cmd: 'Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, TotalPhysicalMemory' },
          { label: 'Disk Space', cmd: 'Get-PSDrive -PSProvider FileSystem | Format-Table' }
        ]
      : [
          { label: 'whoami', cmd: 'whoami' },
          { label: 'ipconfig /all', cmd: 'ipconfig /all' },
          { label: 'netstat -ano', cmd: 'netstat -ano' },
          { label: 'tasklist', cmd: 'tasklist' },
          { label: 'systeminfo', cmd: 'systeminfo' },
          { label: 'ping test', cmd: 'ping 8.8.8.8 -n 4' }
        ]
    : [
        { label: 'whoami', cmd: 'whoami' },
        { label: 'top (snapshot)', cmd: 'top -b -n 1 | head -n 15' },
        { label: 'df -h', cmd: 'df -h' },
        { label: 'free -m', cmd: 'free -m' },
        { label: 'uptime', cmd: 'uptime' },
        { label: 'uname -a', cmd: 'uname -a' }
      ];

  return (
    <div className="flex flex-col h-full bg-[#080b11] text-slate-100 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Top Console Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e131f] border-b border-slate-800 shrink-0">
        {/* Left: Window Dots & Shell Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 border border-slate-800">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>

          {/* Shell Selector Buttons */}
          <div className="flex items-center bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
            {isWindows ? (
              <>
                <button
                  onClick={() => setActiveShell('powershell')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                    activeShell === 'powershell'
                      ? 'bg-sky-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Connect via persistent Windows PowerShell"
                >
                  <Zap className="w-3.5 h-3.5 text-sky-200" />
                  <span>PowerShell</span>
                </button>
                <button
                  onClick={() => setActiveShell('cmd')}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                    activeShell === 'cmd'
                      ? 'bg-amber-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Connect via persistent Command Prompt (cmd.exe)"
                >
                  <TerminalIcon className="w-3.5 h-3.5 text-amber-200" />
                  <span>Terminal (CMD)</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setActiveShell('bash')}
                className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 text-white flex items-center gap-1.5"
              >
                <TerminalIcon className="w-3.5 h-3.5" />
                <span>Bash / Shell</span>
              </button>
            )}
          </div>

          {/* Live Status Indicator */}
          <div className="flex items-center gap-1.5 pl-2">
            {status === 'connected' ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Stream
              </span>
            ) : status === 'connecting' ? (
              <span className="flex items-center gap-1 text-[11px] text-sky-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Connecting…
              </span>
            ) : (
              <button
                onClick={() => connectSession(activeShell)}
                className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold underline"
                title="Click to reconnect"
              >
                <WifiOff className="w-3 h-3" />
                Disconnected (Click to reconnect)
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <span className="hidden xl:inline-block text-[11px] font-mono text-slate-400 mr-2">
            {device.name} • {device.ipAddress}
          </span>

          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition flex items-center gap-1 text-xs"
            title="Clear terminal screen"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px]">Clear</span>
          </button>

          <button
            onClick={handleCopySelection}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition flex items-center gap-1 text-xs"
            title="Copy selection or entire terminal buffer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition"
              title={isExpanded ? 'Collapse drawer width' : 'Expand full width'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Active User Context & Domain Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#0a0d16] border-b border-slate-800 text-[11px] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-300">
            <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-slate-500 font-sans text-[10px] uppercase font-bold tracking-wider">Logged In User:</span>
            <span className="font-semibold text-emerald-400 font-mono">
              {device.loggedInUser || 'No active user'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-slate-500 font-sans text-[10px] uppercase font-bold tracking-wider">Domain:</span>
            <span className="font-mono text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">
              {device.domain || 'WORKGROUP'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Shield className="w-3 h-3 text-amber-400" />
          <span className="text-slate-500 font-sans uppercase font-bold">Shell Privilege:</span>
          <span className="font-mono text-amber-300 font-bold">NT AUTHORITY\SYSTEM</span>
          <span className="text-slate-500 hidden sm:inline">(Backstage Service Session)</span>
        </div>
      </div>

      {/* Quick Snippet Action Pills */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b0e17] border-b border-slate-800/70 overflow-x-auto custom-scrollbar shrink-0 text-[11px]">
        <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0 mr-1 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" /> Quick Send:
        </span>
        {quickSnippets.map((s, idx) => (
          <button
            key={idx}
            onClick={() => sendCommandText(s.cmd)}
            disabled={status !== 'connected'}
            className="shrink-0 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition font-mono text-[11px] flex items-center gap-1"
            title={`Run "${s.cmd}" instantly`}
          >
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Main Terminal Screen Area (Xterm.js) */}
      <div className="flex-1 relative bg-[#0a0e17] overflow-hidden min-h-[380px]">
        {status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0e17]/90 text-slate-300 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
            <p className="text-xs font-mono">{statusMessage}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0e17]/95 text-rose-300 gap-3 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-xs font-mono max-w-md">{statusMessage}</p>
            <button
              onClick={() => connectSession(activeShell)}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition mt-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reconnect
            </button>
          </div>
        )}

        <div
          ref={termContainerRef}
          className="w-full h-full p-2.5 select-text"
          style={{ height: '100%' }}
        />
      </div>

      {/* Interactive Bottom Quick Input Line */}
      <div className="p-2.5 bg-[#0e131f] border-t border-slate-800 shrink-0">
        <form onSubmit={handleInputSubmit} className="flex items-center gap-2 bg-[#06080e] rounded-lg border border-slate-700/80 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500/40 px-3 py-1.5 transition">
          {/* Prompt prefix label */}
          <span className="shrink-0 font-mono font-bold text-xs select-none">
            {activeShell === 'powershell' ? (
              <span className="text-sky-400">PS&gt;</span>
            ) : activeShell === 'cmd' ? (
              <span className="text-amber-400">CMD&gt;</span>
            ) : (
              <span className="text-emerald-400">$</span>
            )}
          </span>

          {/* Input field */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={status !== 'connected'}
            placeholder={
              status === 'connected'
                ? `Execute command in ${activeShell === 'powershell' ? 'PowerShell' : 'CMD'} (or click above to type directly)...`
                : 'Connecting to live terminal...'
            }
            className="flex-1 bg-transparent text-white font-mono text-xs outline-none placeholder:text-slate-600 disabled:opacity-40"
          />

          {/* Run Button */}
          <button
            type="submit"
            disabled={!inputValue.trim() || status !== 'connected'}
            className="px-3 py-1 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm shrink-0"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 px-1">
          <span>
            {activeShell === 'powershell'
              ? '⚡ Real-Time Windows PowerShell'
              : activeShell === 'cmd'
              ? '>_ Real-Time Command Prompt'
              : '🐚 Real-Time Unix Shell'}
          </span>
          <span>Click terminal to type interactively • Press Enter ↵ to send</span>
        </div>
      </div>
    </div>
  );
};
