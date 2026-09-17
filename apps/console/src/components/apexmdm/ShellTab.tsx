import React, { useState, useRef, useEffect } from 'react';
import type { MdmDevice } from '@openmsp/api-types';
import { Terminal as TerminalIcon, Send, RefreshCw, Smartphone } from 'lucide-react';
import { apexMdm } from '../../services/api';

interface ShellTabProps {
  devices: MdmDevice[];
  targetDevice?: MdmDevice;
  onTriggerToast: (msg: string) => void;
}

interface ShellLog {
  id: string;
  cmd: string;
  output: string;
}

export const ShellTab: React.FC<ShellTabProps> = ({ devices, targetDevice, onTriggerToast }) => {
  const [selectedId, setSelectedId] = useState<string>(targetDevice?.id || devices[0]?.id || '');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<ShellLog[]>([
    {
      id: 'init-1',
      cmd: 'dumpsys battery',
      output:
        'Current Battery Service state:\n  AC powered: true\n  USB powered: false\n  Wireless powered: false\n  Max charging current: 3000000\n  status: 2 (Charging)\n  health: 2 (Good)\n  present: true\n  level: 92\n  scale: 100\n  voltage: 4280\n  temperature: 294'
    },
    {
      id: 'init-2',
      cmd: 'getprop ro.product.model',
      output: 'Galaxy Tab Active4 Pro'
    }
  ]);
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd || !selectedId) return;

    setRunning(true);
    try {
      const res = await apexMdm.sendShellCommand(selectedId, cmd);
      setLogs((prev) => [
        ...prev,
        {
          id: `cmd-${Date.now()}`,
          cmd,
          output: res.output || 'Command executed (exit code 0)'
        }
      ]);
      setInput('');
    } catch {
      onTriggerToast(`Failed to execute "${cmd}"`);
    } finally {
      setRunning(false);
    }
  };

  const handleQuickCmd = (cmd: string) => {
    setInput(cmd);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto flex flex-col h-[calc(100vh-210px)] min-h-[480px]">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white">Direct Android Root Terminal</span>
          <span className="text-xs text-slate-400 font-mono">/bin/sh</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Target Terminal:</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.model} • {d.ipAddress})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 bg-black/90 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-4 shadow-inner">
        <div className="text-slate-500 select-none pb-2 border-b border-slate-800">
          ApexMDM Android Shell Bridge v2.4.0 — Connected via TLS Control Socket
          <br />
          Type standard Android toolbox/toybox commands or click shortcuts below.
        </div>

        {logs.map((log) => (
          <div key={log.id} className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="text-slate-500">root@android:#</span>
              <span>{log.cmd}</span>
            </div>
            <pre className="text-slate-300 pl-4 whitespace-pre-wrap leading-relaxed text-[11px] font-mono">
              {log.output}
            </pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick shortcuts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 text-xs">
        <span className="text-slate-500 shrink-0 font-medium">Quick Scripts:</span>
        <button
          onClick={() => handleQuickCmd('dumpsys battery')}
          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-700/60 transition-colors whitespace-nowrap"
        >
          dumpsys battery
        </button>
        <button
          onClick={() => handleQuickCmd('pm list packages -3')}
          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-700/60 transition-colors whitespace-nowrap"
        >
          list 3rd-party apps
        </button>
        <button
          onClick={() => handleQuickCmd('cat /proc/meminfo | head -n 8')}
          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-700/60 transition-colors whitespace-nowrap"
        >
          meminfo
        </button>
        <button
          onClick={() => handleQuickCmd('netstat -tuln')}
          className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-md border border-slate-700/60 transition-colors whitespace-nowrap"
        >
          open ports
        </button>
      </div>

      {/* Input box */}
      <form onSubmit={handleExecute} className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-xs select-none">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={running}
            placeholder="Enter shell command (e.g. logcat -d -t 50, ifconfig, am start)..."
            className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={running || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
        >
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Execute
        </button>
      </form>
    </div>
  );
};
