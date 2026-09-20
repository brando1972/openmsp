import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Play
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { useApp } from '../../../data/AppContext';

export interface EventLogItem {
  id: number;
  time: string;
  level: 'Critical' | 'Error' | 'Warning' | 'Information';
  provider: string;
  channel: 'System' | 'Application' | 'Security';
  message: string;
}

interface BackstageEventViewerProps {
  device: ManagedDevice;
  onOpenTerminalWithCommand?: (cmd: string) => void;
}

export const BackstageEventViewer: React.FC<BackstageEventViewerProps> = ({
  device,
  onOpenTerminalWithCommand
}) => {
  const { runRemoteScriptOnDevice } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'All' | 'Critical' | 'Error' | 'Warning' | 'Information'>('All');
  const [channelFilter, setChannelFilter] = useState<'All' | 'System' | 'Application' | 'Security'>('All');
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  // Baseline standard Windows system event logs
  const defaultLogs = useMemo<EventLogItem[]>(() => [
    {
      id: 7036,
      time: '2026-09-19 21:05:12',
      level: 'Information',
      provider: 'Service Control Manager',
      channel: 'System',
      message: 'The Mesh Agent service entered the running state.'
    },
    {
      id: 10016,
      time: '2026-09-19 20:45:30',
      level: 'Warning',
      provider: 'Microsoft-Windows-DistributedCOM',
      channel: 'System',
      message: 'The application-specific permission settings do not grant Local Activation permission for the COM Server application with CLSID {2593F8B9-4EAF-457C-B68A-50F6B8EA6B54}.'
    },
    {
      id: 41,
      time: '2026-09-19 18:22:04',
      level: 'Critical',
      provider: 'Microsoft-Windows-Kernel-Power',
      channel: 'System',
      message: 'The system has rebooted without cleanly shutting down first. This error could be caused if the system stopped responding, crashed, or lost power unexpectedly.'
    },
    {
      id: 1000,
      time: '2026-09-19 17:15:20',
      level: 'Error',
      provider: 'Application Error',
      channel: 'Application',
      message: 'Faulting application name: explorer.exe, version: 10.0.19041.1000, faulting module name: ntdll.dll, version: 10.0.19041.1000, exception code: 0xc0000005.'
    },
    {
      id: 6005,
      time: '2026-09-19 18:22:15',
      level: 'Information',
      provider: 'EventLog',
      channel: 'System',
      message: 'The Event log service was started.'
    },
    {
      id: 7001,
      time: '2026-09-19 16:30:10',
      level: 'Error',
      provider: 'Service Control Manager',
      channel: 'System',
      message: 'The Netlogon service depends on the LanmanWorkstation service which failed to start because of the following error: The service cannot be started, either because it is disabled or because it has no enabled devices associated with it.'
    },
    {
      id: 4624,
      time: '2026-09-19 21:00:00',
      level: 'Information',
      provider: 'Microsoft-Windows-Security-Auditing',
      channel: 'Security',
      message: `An account was successfully logged on. Subject User: ${device.loggedInUser || 'joshg'}, Logon Type: 2 (Interactive Console).`
    }
  ], [device.loggedInUser]);

  const [logs] = useState<EventLogItem[]>(defaultLogs);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return logs.filter(l => {
      const matchQ = l.provider.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        String(l.id).includes(q);
      if (!matchQ) return false;
      if (levelFilter !== 'All' && l.level !== levelFilter) return false;
      if (channelFilter !== 'All' && l.channel !== channelFilter) return false;
      return true;
    });
  }, [logs, searchQuery, levelFilter, channelFilter]);

  const getLevelBadge = (level: EventLogItem['level']) => {
    switch (level) {
      case 'Critical':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-950/80 text-purple-300 border border-purple-800">Critical</span>;
      case 'Error':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950/80 text-rose-300 border border-rose-800">Error</span>;
      case 'Warning':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800">Warning</span>;
      case 'Information':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-950/80 text-sky-300 border border-sky-800">Info</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] text-slate-200 overflow-hidden select-none font-sans">
      {/* Top Controls */}
      <div className="p-3 bg-[#0e1320] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event logs by message or ID…"
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono"
            />
          </div>
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          {(['All', 'Critical', 'Error', 'Warning', 'Information'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2 py-1 rounded text-xs font-semibold transition ${
                levelFilter === lvl
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d111d] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
        <div className="col-span-2">Time Created</div>
        <div className="col-span-2">Level</div>
        <div className="col-span-1">Event ID</div>
        <div className="col-span-3">Provider / Source</div>
        <div className="col-span-4">Message</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 text-xs font-mono">
        {filteredLogs.map((item, idx) => {
          const isExpanded = expandedEventId === idx;

          return (
            <div
              key={idx}
              onClick={() => setExpandedEventId(isExpanded ? null : idx)}
              className="px-3 py-2.5 hover:bg-slate-800/40 cursor-pointer transition"
            >
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2 text-slate-400 text-[11px] truncate">{item.time}</div>
                <div className="col-span-2 font-sans">{getLevelBadge(item.level)}</div>
                <div className="col-span-1 text-slate-300 font-bold">{item.id}</div>
                <div className="col-span-3 text-slate-300 truncate font-sans font-medium">{item.provider}</div>
                <div className="col-span-4 text-slate-400 truncate flex items-center justify-between gap-1 font-sans">
                  <span className="truncate">{item.message}</span>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2.5 p-3 bg-slate-900/90 rounded border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed space-y-1 animate-fadeIn">
                  <div className="text-[11px] font-mono text-slate-500">Channel: {item.channel} • Event ID: {item.id} • Provider: {item.provider}</div>
                  <div className="pt-1 text-slate-100">{item.message}</div>
                </div>
              )}
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="py-12 text-center text-slate-500 font-sans">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">No events matched filters</div>
            <div className="text-xs text-slate-600 mt-1">Try selecting "All" severity levels</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Showing <strong className="text-slate-200">{filteredLogs.length}</strong> event records</span>

        {onOpenTerminalWithCommand && (
          <button
            onClick={() => onOpenTerminalWithCommand('Get-WinEvent -FilterHashtable @{LogName="System"; Level=1,2,3} -MaxEvents 10 | Format-Table -AutoSize')}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <span>Query via Terminal</span>
          </button>
        )}
      </div>
    </div>
  );
};
