import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { runDeviceScript, runRemotePsList } from './remoteExec';
import { BackstageLiveStatus } from './BackstageLiveStatus';

const MAX_EVENTS = 200;

const levelName = (level: number): EventLogItem['level'] =>
  level === 1 ? 'Critical' : level === 2 ? 'Error' : level === 3 ? 'Warning' : 'Information';

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
  // Backstage waits for a full agent check-in; AppContext's runner gives up at 25s.
  const runRemoteScriptOnDevice = runDeviceScript;
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'All' | 'Critical' | 'Error' | 'Warning' | 'Information'>('All');
  const [channelFilter, setChannelFilter] = useState<'All' | 'System' | 'Application' | 'Security'>('All');
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  const isWindows = device.os === 'windows';
  const [logs, setLogs] = useState<EventLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!isWindows) return;
    setIsLoading(true);
    setExpandedEventId(null);
    try {
      // Security is only read when picked explicitly: it is large and mostly noise.
      const logNames = channelFilter === 'All' ? ['System', 'Application'] : [channelFilter];
      const names = logNames.map((n) => `'${n}'`).join(',');
      const rows = await runRemotePsList<{ Id: number; Time: string; Level: number; Provider: string; LogName: string; Message: string | null }>(
        runRemoteScriptOnDevice,
        device.id,
        `$(try { Get-WinEvent -FilterHashtable @{ LogName = @(${names}) } -MaxEvents ${MAX_EVENTS} -ErrorAction Stop } ` +
          `catch { if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { @() } else { throw } }) | ` +
          `Select-Object Id, @{N='Time';E={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')}}, Level, ` +
          `@{N='Provider';E={$_.ProviderName}}, LogName, ` +
          `@{N='Message';E={ $m = $_.Message; if ($m -and $m.Length -gt 2000) { $m.Substring(0, 2000) + '...' } else { $m } }}`
      );
      setLogs(rows.map((r) => ({
        id: Number(r.Id),
        time: r.Time,
        level: levelName(r.Level),
        provider: r.Provider || '',
        channel: (r.LogName as EventLogItem['channel']) || 'System',
        message: r.Message || '(No message text)'
      })).sort((x, y) => y.time.localeCompare(x.time)));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [device.id, isWindows, runRemoteScriptOnDevice, channelFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return logs.filter(l => {
      const matchQ = l.provider.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        String(l.id).includes(q);
      if (!matchQ) return false;
      if (levelFilter !== 'All' && l.level !== levelFilter) return false;
      return true;
    });
  }, [logs, searchQuery, levelFilter]);

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

        {/* Log + Severity Filters */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}
            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs"
            title="Which event log to read from the device"
          >
            <option value="All">System + Application</option>
            <option value="System">System</option>
            <option value="Application">Application</option>
            <option value="Security">Security</option>
          </select>
          <button
            onClick={fetchEvents}
            disabled={isLoading || !isWindows}
            title="Reload events from the device"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
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

      {logs.length > 0 && loadError && (
        <div className="px-3 py-2 text-xs border-b shrink-0 bg-amber-950/70 text-amber-300 border-amber-800">
          Refresh failed, showing the last events received from the device: {loadError}
        </div>
      )}

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

        {!isWindows ? (
          <BackstageLiveStatus state="unsupported" deviceName={device.name} what="event logs" />
        ) : isLoading && logs.length === 0 ? (
          <BackstageLiveStatus state="loading" deviceName={device.name} what="event logs" />
        ) : loadError && logs.length === 0 ? (
          <BackstageLiveStatus state="error" deviceName={device.name} what="event logs" error={loadError} onRetry={fetchEvents} />
        ) : hasLoaded && filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-sans">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">No events matched filters</div>
            <div className="text-xs text-slate-600 mt-1">Try selecting "All" severity levels</div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Showing <strong className="text-slate-200">{filteredLogs.length}</strong> of the latest {logs.length} events</span>

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
