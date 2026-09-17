import React, { useState, useRef, useEffect } from 'react';
import type { MdmDevice } from '@openmsp/api-types';
import { Terminal as TerminalIcon, Send, RefreshCw } from 'lucide-react';
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
        'Current Battery Service state:\n  AC powered: true\n  USB powered: false\n  level: 92\n  scale: 100\n  voltage: 4192 mV\n  temperature: 29.4 C\n  health: 2 (GOOD)'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = input.trim();
    if (!cmd || !selectedId) return;

    setInput('');
    setLoading(true);

    try {
      const res = await apexMdm.executeShell(selectedId, cmd);
      setLogs((prev) => [...prev, { id: String(Date.now()), cmd, output: res.output }]);
      onTriggerToast(`Executed: ${cmd}`);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        { id: String(Date.now()), cmd, output: `Error executing command: ${err.message || 'unknown error'}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const runQuick = (cmd: string) => {
    setInput(cmd);
    setTimeout(() => {
      apexMdm
        .executeShell(selectedId, cmd)
        .then((res) => {
          setLogs((prev) => [...prev, { id: String(Date.now()), cmd, output: res.output }]);
          onTriggerToast(`Executed: ${cmd}`);
        })
        .catch(() => {});
    }, 50);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Remote Android Shell & Diagnostics</h2>
          <p className="text-xs text-slate-400">
            Execute Linux toybox commands and Android package management scripts directly on connected tablets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.serialNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-black border border-slate-800 rounded-2xl p-4 font-mono text-xs shadow-2xl flex flex-col h-[480px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="ml-2 text-slate-300 font-semibold flex items-center gap-1.5">
              <TerminalIcon className="w-3.5 h-3.5 text-fuchsia-400" /> apex-dpc@android:/system/bin $
            </span>
          </div>
          <span className="text-emerald-400">DPC Daemon: Rootless DeviceOwner</span>
        </div>

        {/* Output Stream */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 text-slate-300">
          <div className="text-slate-500"># Connected to tablet via ApexMSP Secure WebSocket Tunnel</div>
          <div className="text-slate-500"># Type commands below (e.g., 'dumpsys battery', 'pm list packages', 'netstat')</div>

          {logs.map((l) => (
            <div key={l.id} className="space-y-1">
              <div className="text-fuchsia-400 font-bold">$ {l.cmd}</div>
              <pre className="text-emerald-400/90 font-mono text-[11px] pl-4 whitespace-pre-wrap">{l.output}</pre>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <RefreshCw className="w-3 h-3 animate-spin text-fuchsia-400" /> Executing command on device...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="mt-3 pt-2 border-t border-slate-800 flex items-center gap-2">
          <span className="text-fuchsia-400 font-bold">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter shell command..."
            className="flex-1 bg-transparent text-emerald-400 font-mono focus:outline-none placeholder-slate-600 text-xs"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-3 py-1.5 rounded transition flex items-center gap-1 text-xs"
          >
            <Send className="w-3 h-3" /> Run
          </button>
        </form>
      </div>

      {/* Quick Scripts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <button
          onClick={() => runQuick('pm clear com.squareup')}
          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="font-semibold text-white group-hover:text-fuchsia-400">Clear App Cache (Fix Freeze)</div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">pm clear com.squareup</div>
        </button>

        <button
          onClick={() => runQuick('ip route show')}
          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="font-semibold text-white group-hover:text-fuchsia-400">Route Table & Gateways</div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">ip route show</div>
        </button>

        <button
          onClick={() => runQuick('pm list packages')}
          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="font-semibold text-white group-hover:text-fuchsia-400">Installed Packages List</div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">pm list packages</div>
        </button>
      </div>
    </div>
  );
};
