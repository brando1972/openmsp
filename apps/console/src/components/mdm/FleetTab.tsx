import React, { useState } from 'react';
import type { MdmDevice } from '@openmsp/api-types';
import { Smartphone, RefreshCw, AlertTriangle, Zap, Wifi, Terminal, Eye } from 'lucide-react';

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
    if (filter === 'attention' && d.status !== 'attention') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.serialNumber.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.ipAddress.includes(q)
      );
    }
    return true;
  });

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
      onTriggerToast(`Selected all ${filtered.length} tablets`);
    } else {
      setSelectedIds(new Set());
      onTriggerToast('Deselected all tablets');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar & Bulk Operations */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by tablet, serial, model..."
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 w-64"
            />
            <Smartphone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          </div>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded transition ${filter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              All ({devices.length})
            </button>
            <button
              onClick={() => setFilter('online')}
              className={`px-2.5 py-1 rounded transition ${filter === 'online' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Online ({devices.filter((d) => d.status === 'online').length})
            </button>
            <button
              onClick={() => setFilter('kiosk')}
              className={`px-2.5 py-1 rounded transition ${filter === 'kiosk' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Locked Kiosk ({devices.filter((d) => d.kioskModeActive).length})
            </button>
            <button
              onClick={() => setFilter('attention')}
              className={`px-2.5 py-1 rounded transition ${filter === 'attention' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
            >
              Attention ({devices.filter((d) => d.status === 'attention').length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <input
              type="checkbox"
              id="selectAll"
              checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-fuchsia-600 focus:ring-0 w-3.5 h-3.5"
            />
            <label htmlFor="selectAll" className="cursor-pointer text-[11px] text-slate-400">
              Select All
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onTriggerToast(`Bulk reboot queued for ${selectedIds.size || filtered.length} devices`)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded border border-slate-700 text-[11px] font-medium transition"
            >
              Bulk Reboot
            </button>
            <button
              onClick={onRefresh}
              className="p-1.5 hover:bg-slate-800 rounded border border-slate-800 text-slate-300 transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Tablet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => {
          const isAttention = d.status === 'attention';
          return (
            <div
              key={d.id}
              className={`bg-slate-900/90 border rounded-xl p-4 transition flex flex-col justify-between shadow-sm relative group ${
                isAttention
                  ? 'border-rose-500/40 hover:border-rose-500'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(d.id)}
                onChange={() => toggleSelect(d.id)}
                className="absolute top-4 right-4 rounded bg-slate-800 border-slate-700 text-fuchsia-600 focus:ring-0 w-4 h-4 z-10"
              />

              <div>
                <div className="flex items-start justify-between pr-7">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center ${
                        isAttention
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-slate-800 border-slate-700/60 text-fuchsia-400'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-white">{d.name}</h3>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isAttention
                              ? 'bg-rose-500 animate-ping'
                              : d.status === 'online'
                              ? 'bg-emerald-400'
                              : 'bg-slate-500'
                          }`}
                          title={d.status}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">
                        {d.model} • <span className="text-slate-300">{d.serialNumber}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap text-[10px]">
                  <span className="font-semibold bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-800/60 px-2 py-0.5 rounded-full">
                    {d.configName}
                  </span>
                  {d.geofenceStatus === 'breach' ? (
                    <span className="bg-rose-950 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Perimeter Breach
                    </span>
                  ) : (
                    <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                      Inside Geofence
                    </span>
                  )}
                  {d.watchdogCrashesPrevented > 0 && (
                    <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded-full">
                      Watchdog: {d.watchdogCrashesPrevented} healed
                    </span>
                  )}
                </div>

                {/* Telemetry Row */}
                <div className="grid grid-cols-3 gap-2 my-3.5 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Battery</div>
                    <div
                      className={`font-medium flex items-center gap-1 ${
                        d.batteryLevel < 20 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {d.isCharging && <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />}
                      {d.batteryLevel}% ({d.batteryHealthPercent}% Health)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Network</div>
                    <div className="font-medium text-slate-200 truncate flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-slate-400" />
                      {d.wifiSsid} ({d.wifiRssi} dBm)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Active App</div>
                    <div className="font-medium text-fuchsia-400 truncate">{d.activeAppName}</div>
                  </div>
                </div>

                {/* Remote Screen Clickable Thumbnail Preview */}
                <div
                  onClick={() => onOpenRemote(d)}
                  className="h-28 bg-slate-950 rounded-lg border border-slate-800 relative overflow-hidden flex items-center justify-center cursor-pointer group-hover:border-fuchsia-500/50 transition"
                >
                  <div className="text-center p-3">
                    <div className="inline-flex p-2 rounded-full bg-slate-900 border border-slate-700 text-fuchsia-400 mb-1 group-hover:scale-110 transition">
                      <Eye className="w-4 h-4" />
                    </div>
                    <div className="text-[11px] font-medium text-slate-300">Click to Open Remote View</div>
                    <div className="text-[10px] text-slate-500">Live VNC Stream • AI Logcat Diagnoser</div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-500 font-mono">{d.ipAddress}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenShell(d)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title="Open Android Shell"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onReboot(d)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  >
                    Reboot
                  </button>
                  <button
                    onClick={() => onOpenRemote(d)}
                    className="px-2.5 py-1 rounded bg-fuchsia-600/90 hover:bg-fuchsia-500 text-white font-medium transition"
                  >
                    View & Control
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
