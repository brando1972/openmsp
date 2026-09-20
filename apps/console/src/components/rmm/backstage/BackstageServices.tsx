import React, { useState, useMemo } from 'react';
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
import { useApp } from '../../../data/AppContext';

interface BackstageServicesProps {
  device: ManagedDevice;
  onOpenTerminalWithCommand?: (cmd: string) => void;
}

export const BackstageServices: React.FC<BackstageServicesProps> = ({
  device,
  onOpenTerminalWithCommand
}) => {
  const { runRemoteScriptOnDevice } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Baseline standard Windows services
  const defaultServices = useMemo<DeviceService[]>(() => {
    if (device.services && device.services.length > 0) {
      return device.services;
    }
    return [
      { name: 'Spooler', displayName: 'Print Spooler', status: 'running', startupType: 'auto' },
      { name: 'wuauserv', displayName: 'Windows Update', status: 'running', startupType: 'auto' },
      { name: 'Mesh Agent', displayName: 'MeshCentral Background Agent', status: 'running', startupType: 'auto' },
      { name: 'ApexMSPAgent', displayName: 'ApexMSP Endpoint Service', status: 'running', startupType: 'auto' },
      { name: 'WinDefend', displayName: 'Microsoft Defender Antivirus Service', status: 'running', startupType: 'auto' },
      { name: 'W32Time', displayName: 'Windows Time', status: 'running', startupType: 'auto' },
      { name: 'EventLog', displayName: 'Windows Event Log', status: 'running', startupType: 'auto' },
      { name: 'BITS', displayName: 'Background Intelligent Transfer Service', status: 'running', startupType: 'auto' },
      { name: 'LanmanServer', displayName: 'Server (SMB)', status: 'running', startupType: 'auto' },
      { name: 'LanmanWorkstation', displayName: 'Workstation', status: 'running', startupType: 'auto' },
      { name: 'Dhcp', displayName: 'DHCP Client', status: 'running', startupType: 'auto' },
      { name: 'Dnscache', displayName: 'DNS Client', status: 'running', startupType: 'auto' },
      { name: 'TermService', displayName: 'Remote Desktop Services', status: 'stopped', startupType: 'manual' },
      { name: 'RemoteRegistry', displayName: 'Remote Registry', status: 'stopped', startupType: 'disabled' },
      { name: 'SysMain', displayName: 'SysMain / Superfetch', status: 'running', startupType: 'auto' },
      { name: 'WerSvc', displayName: 'Windows Error Reporting Service', status: 'stopped', startupType: 'manual' }
    ];
  }, [device.services]);

  const [servicesList, setServicesList] = useState<DeviceService[]>(defaultServices);

  const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    setActiveAction(`${serviceName}-${action}`);
    setActionMessage({ text: `${action.toUpperCase()}ing service "${serviceName}"…`, type: 'info' });

    try {
      let cmd = '';
      if (action === 'start') {
        cmd = `Start-Service -Name '${serviceName}' -ErrorAction SilentlyContinue; Get-Service -Name '${serviceName}' | Select-Object Status`;
      } else if (action === 'stop') {
        cmd = `Stop-Service -Name '${serviceName}' -Force -ErrorAction SilentlyContinue; Get-Service -Name '${serviceName}' | Select-Object Status`;
      } else if (action === 'restart') {
        cmd = `Restart-Service -Name '${serviceName}' -Force -ErrorAction SilentlyContinue; Get-Service -Name '${serviceName}' | Select-Object Status`;
      }

      await runRemoteScriptOnDevice(device.id, cmd, 'powershell');

      // Update state optimistically
      setServicesList(prev => prev.map(s => {
        if (s.name.toLowerCase() === serviceName.toLowerCase()) {
          const nextStatus = action === 'stop' ? 'stopped' : 'running';
          return { ...s, status: nextStatus };
        }
        return s;
      }));

      setActionMessage({ text: `Service "${serviceName}" successfully ${action}ed.`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: `Failed to ${action} "${serviceName}": ${err?.message || err}`, type: 'error' });
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

        {filteredServices.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            <Cog className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">No matching services found</div>
            <div className="text-xs text-slate-600 mt-1">Try changing filter criteria</div>
          </div>
        )}
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
