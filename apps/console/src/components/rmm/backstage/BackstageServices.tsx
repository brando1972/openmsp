import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Cog,
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Check,
  X,
  AlertCircle,
  Filter
} from 'lucide-react';
import { ManagedDevice, DeviceService } from '../../../types';
import { runDeviceScript, runRemotePsJson, runRemotePsList, psQuote } from './remoteExec';
import { BackstageLiveStatus } from './BackstageLiveStatus';

interface ServiceRow {
  Name: string;
  DisplayName: string | null;
  State: string | null;
  StartMode: string | null;
}

const toDeviceService = (row: ServiceRow): DeviceService => {
  const mode = (row.StartMode || '').toLowerCase();
  return {
    name: row.Name,
    displayName: row.DisplayName || row.Name,
    status: row.State === 'Running' ? 'running' : 'stopped',
    startupType: mode === 'disabled' ? 'disabled' : mode === 'manual' ? 'manual' : 'auto'
  };
};

interface BackstageServicesProps {
  device: ManagedDevice;
  onOpenTerminalWithCommand?: (cmd: string) => void;
}

export const BackstageServices: React.FC<BackstageServicesProps> = ({
  device,
  onOpenTerminalWithCommand
}) => {
  // Runs over the always-connected MeshCentral agent (see remoteExec/meshShell).
  const runRemoteScriptOnDevice = runDeviceScript;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const isWindows = device.os === 'windows';
  const [servicesList, setServicesList] = useState<DeviceService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!isWindows) return;
    setIsLoading(true);
    try {
      const rows = await runRemotePsList<ServiceRow>(
        runRemoteScriptOnDevice,
        device.id,
        'Get-CimInstance Win32_Service | Select-Object Name, DisplayName, State, StartMode'
      );
      setServicesList(rows.map(toDeviceService).sort((x, y) => (x.displayName || x.name).localeCompare(y.displayName || y.name)));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [device.id, isWindows, runRemoteScriptOnDevice]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    setActiveAction(`${serviceName}-${action}`);
    setActionMessage({ text: `${action.toUpperCase()}ing service "${serviceName}"…`, type: 'info' });

    try {
      const verb = action === 'start' ? 'Start-Service' : action === 'stop' ? 'Stop-Service -Force' : 'Restart-Service -Force';
      const name = psQuote(serviceName);
      const after = await runRemotePsJson<ServiceRow>(
        runRemoteScriptOnDevice,
        device.id,
        `& { ${verb} -Name ${name}; Get-CimInstance Win32_Service | Where-Object Name -eq ${name} | Select-Object Name, DisplayName, State, StartMode }`
      );
      const updated = after ? toDeviceService(after) : null;
      if (updated) {
        setServicesList(prev => prev.map(s => (s.name.toLowerCase() === serviceName.toLowerCase() ? updated : s)));
      }
      setActionMessage({
        text: `${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted'} "${serviceName}"${updated ? ` (now ${updated.status})` : ''}.`,
        type: 'success'
      });
    } catch (err) {
      setActionMessage({ text: `Failed to ${action} "${serviceName}": ${err instanceof Error ? err.message : err}`, type: 'error' });
    } finally {
      setActiveAction(null);
    }
  };

  const filteredServices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return servicesList.filter(s => {
      const matchQ = s.name.toLowerCase().includes(q) || (s.displayName && s.displayName.toLowerCase().includes(q));
      if (!matchQ) return false;
      if (statusFilter === 'all') return true;
      return s.status === statusFilter;
    });
  }, [servicesList, searchQuery, statusFilter]);

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] text-slate-200 overflow-hidden select-none font-sans">
      {/* Top Filter Controls */}
      <div className="p-3 bg-[#0e1320] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services by display name or key…"
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition font-mono"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          <button
            onClick={fetchServices}
            disabled={isLoading || !isWindows}
            title="Refresh services from the device"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({servicesList.length})
          </button>
          <button
            onClick={() => setStatusFilter('running')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
              statusFilter === 'running'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800/80 text-emerald-400 hover:text-emerald-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Running ({servicesList.filter(s => s.status === 'running').length})
          </button>
          <button
            onClick={() => setStatusFilter('stopped')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
              statusFilter === 'stopped'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Stopped ({servicesList.filter(s => s.status === 'stopped').length})
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`px-3 py-2 text-xs flex items-center justify-between border-b shrink-0 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
              : actionMessage.type === 'error'
              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
              : 'bg-blue-950/80 text-blue-300 border-blue-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {servicesList.length > 0 && loadError && (
        <div className="px-3 py-2 text-xs border-b shrink-0 bg-amber-950/70 text-amber-300 border-amber-800">
          Refresh failed, showing the last list received from the device: {loadError}
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d111d] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
        <div className="col-span-5">Service Display Name</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Startup Type</div>
        <div className="col-span-3 text-right">Backstage Actions</div>
      </div>

      {/* Table Rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 text-xs">
        {filteredServices.map((svc) => {
          const isRunning = svc.status === 'running';
          const isPending = activeAction?.startsWith(`${svc.name}-`);

          return (
            <div
              key={svc.name}
              className="grid grid-cols-12 gap-2 px-3 py-2.5 hover:bg-slate-800/40 items-center transition group"
            >
              <div className="col-span-5 min-w-0 pr-2">
                <div className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
                  <Cog className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{svc.displayName || svc.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate">{svc.name}</div>
              </div>

              <div className="col-span-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    isRunning
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-900 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {svc.status}
                </span>
              </div>

              <div className="col-span-2 text-slate-400 text-[11px] capitalize font-mono">
                {svc.startupType || 'auto'}
              </div>

              <div className="col-span-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => handleServiceAction(svc.name, 'restart')}
                        disabled={isPending}
                        className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900/90 text-amber-300 border border-amber-800/80 rounded text-[10px] font-bold flex items-center gap-1 transition"
                        title={`Restart service ${svc.name}`}
                      >
                        <RotateCw className={`w-3 h-3 ${isPending ? 'animate-spin' : ''}`} />
                        <span>Restart</span>
                      </button>
                      <button
                        onClick={() => handleServiceAction(svc.name, 'stop')}
                        disabled={isPending}
                        className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/90 text-rose-300 border border-rose-800/80 rounded text-[10px] font-bold flex items-center gap-1 transition"
                        title={`Stop service ${svc.name}`}
                      >
                        <Square className="w-3 h-3" />
                        <span>Stop</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleServiceAction(svc.name, 'start')}
                      disabled={isPending}
                      className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/80 rounded text-[10px] font-bold flex items-center gap-1 transition"
                      title={`Start service ${svc.name}`}
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>Start</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!isWindows ? (
          <BackstageLiveStatus state="unsupported" deviceName={device.name} what="services" />
        ) : servicesList.length === 0 && isLoading ? (
          <BackstageLiveStatus state="loading" deviceName={device.name} what="services" />
        ) : servicesList.length === 0 && loadError ? (
          <BackstageLiveStatus state="error" deviceName={device.name} what="services" error={loadError} onRetry={fetchServices} />
        ) : servicesList.length > 0 && filteredServices.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Cog className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">No matching services found</div>
            <div className="text-xs text-slate-600 mt-1">Try changing filter criteria</div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Showing <strong className="text-slate-200">{filteredServices.length}</strong> of {servicesList.length} services</span>

        {onOpenTerminalWithCommand && (
          <button
            onClick={() => onOpenTerminalWithCommand('Get-Service | Where-Object Status -eq "Running" | Format-Table -AutoSize')}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <Play className="w-3 h-3" />
            <span>Open in Terminal</span>
          </button>
        )}
      </div>
    </div>
  );
};
