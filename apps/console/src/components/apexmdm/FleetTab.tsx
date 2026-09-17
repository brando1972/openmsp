import React, { useState } from 'react';
import type { MdmDevice } from '@openmsp/api-types';
import { Smartphone, RefreshCw, AlertTriangle, Zap, Wifi, Terminal, Eye, Battery, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface FleetTabProps {
  devices: MdmDevice[];
  onOpenRemote: (device: MdmDevice) => void;
  onOpenShell: (device: MdmDevice) => void;
  onReboot: (device: MdmDevice) => void;
  onRefresh: () => void;
  onTriggerToast: (msg: string) => void;
}

export const FleetTab: React.FC<FleetTabProps> = ({
  devices,
  onOpenRemote,
  onOpenShell,
  onReboot,
  onRefresh,
  onTriggerToast
}) => {
  const [filter, setFilter] = useState<'all' | 'online' | 'kiosk' | 'attention'>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = devices.filter((d) => {
    if (filter === 'online' && d.status !== 'online') return false;
    if (filter === 'kiosk' && !d.kioskModeActive) return false;
    if (filter === 'attention' && d.status !== 'attention' && (d.batteryHealthPercent ?? 100) >= 80) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.serialNumber.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.ipAddress.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatch = (action: string) => {
    if (selectedIds.size === 0) return;
    onTriggerToast(`Queued batch ${action} to ${selectedIds.size} device(s)`);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Filter by name, serial, model, or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'all'
                ? 'bg-fuchsia-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All ({devices.length})
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'online'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Online ({devices.filter((d) => d.status === 'online').length})
          </button>
          <button
            onClick={() => setFilter('kiosk')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'kiosk'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Kiosk ({devices.filter((d) => d.kioskModeActive).length})
          </button>
          <button
            onClick={() => setFilter('attention')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'attention'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Attention (
            {devices.filter((d) => d.status === 'attention' || (d.batteryHealthPercent ?? 100) < 80).length})
          </button>

          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors ml-1"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-fuchsia-950/40 border border-fuchsia-800/60 px-4 py-2 rounded-xl text-xs">
          <span className="text-fuchsia-300 font-semibold">{selectedIds.size} device(s) selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatch('reboot')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors"
            >
              Reboot Selected
            </button>
            <button
              onClick={() => handleBatch('sync')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors"
            >
              Force Policy Sync
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-slate-200 underline ml-2"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Devices Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map((d) => d.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                />
              </th>
              <th className="p-3">Device & Hardware</th>
              <th className="p-3">Status / Kiosk</th>
              <th className="p-3">Battery & Health</th>
              <th className="p-3">Network & IP</th>
              <th className="p-3">Active Policy</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.map((device) => (
              <tr key={device.id} className="hover:bg-slate-800/40 transition-colors group">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(device.id)}
                    onChange={() => toggleSelect(device.id)}
                    className="rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white group-hover:text-fuchsia-400 transition-colors">
                        {device.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {device.model} • SN: {device.serialNumber}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${
                        device.status === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : device.status === 'attention'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          device.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                        }`}
                      />
                      {device.status}
                    </span>
                    {device.kioskModeActive && (
                      <span className="text-[10px] font-semibold text-purple-400">
                        🔒 Kiosk Lock-Task
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-200">
                      <Battery className="w-3.5 h-3.5 text-slate-400" />
                      <span>{device.batteryLevel}%</span>
                      {device.isCharging && <Zap className="w-3 h-3 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Health: {device.batteryHealthPercent}%
                      {device.batteryHealthPercent < 80 && (
                        <span className="text-amber-400 ml-1 font-semibold">(Degraded)</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-mono text-slate-300">{device.ipAddress}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-slate-500" />
                      {device.wifiSsid} ({device.wifiRssi} dBm)
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="text-xs text-slate-300 font-medium">{device.configName}</div>
                  <div className="text-[10px] text-slate-500">{device.groupName || 'Unassigned Group'}</div>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onOpenRemote(device)}
                      className="px-2.5 py-1.5 text-xs font-medium text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                      title="Live Screen & Touch Control"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Remote
                    </button>
                    <button
                      onClick={() => onOpenShell(device)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      title="Drop into Root Shell"
                    >
                      <Terminal className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onReboot(device)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Reboot Terminal"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
