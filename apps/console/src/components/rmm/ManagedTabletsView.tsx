import React, { useEffect, useRef, useState } from 'react';
import {
  Smartphone,
  Laptop,
  Monitor,
  Server,
  Wifi,
  Radio,
  RefreshCw,
  Pencil,
  Check,
  X,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { mdm, devices as devicesApi } from '../../services/api';
import type { ManagedDevice } from '../../types';
import { ApexConnectDesktop } from '../remoteSupport/ApexConnectDesktop';

type LoadState = 'loading' | 'ready' | 'error';

interface DeviceRow {
  id: string;
  name: string;
  os: 'android' | 'macos' | 'windows' | 'linux' | 'network';
  model: string;
  client: string;
  status: 'online' | 'offline' | 'provisioning';
  connectedAt: number;
  viewerUrl: string | null;
  source: 'relay' | 'rmm';
}

const OS_META: Record<DeviceRow['os'], { label: string; Icon: typeof Smartphone; color: string }> = {
  android: { label: 'Android', Icon: Smartphone, color: 'text-emerald-500' },
  macos: { label: 'macOS', Icon: Laptop, color: 'text-purple-500' },
  windows: { label: 'Windows', Icon: Monitor, color: 'text-sky-500' },
  linux: { label: 'Linux', Icon: Server, color: 'text-amber-500' },
  network: { label: 'Network', Icon: Wifi, color: 'text-emerald-500' }
};

const relativeTime = (ms: number): string => {
  if (!ms) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
};

const normalizeOs = (os: string): DeviceRow['os'] => {
  if (os === 'macos' || os === 'windows' || os === 'linux' || os === 'network') return os;
  return 'network';
};

export const ManagedTabletsView: React.FC = () => {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [relayNote, setRelayNote] = useState('');
  const [lastUpdated, setLastUpdated] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [meshTarget, setMeshTarget] = useState<DeviceRow | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setRefreshing(true);
    const [tabletsRes, devicesRes] = await Promise.allSettled([mdm.getTablets(), devicesApi.getDevices()]);

    const next: DeviceRow[] = [];
    let relayMsg = '';

    // Control-plane devices (Mac / Windows / etc.)
    if (devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value)) {
      for (const d of devicesRes.value as ManagedDevice[]) {
        next.push({
          id: d.id,
          name: d.name,
          os: normalizeOs(d.os),
          model: d.osVersion || (d as any).model || '',
          client: d.clientName || '',
          status: d.health === 'offline' ? 'offline' : 'online',
          connectedAt: 0,
          viewerUrl: null,
          source: 'rmm'
        });
      }
    }

    // Relay tablets (Android kiosk fleet)
    if (tabletsRes.status === 'fulfilled') {
      if (tabletsRes.value.configured === false) {
        relayMsg = 'MDM relay not configured';
      } else {
        for (const t of tabletsRes.value.devices || []) {
          next.push({
            id: t.id,
            name: t.name,
            os: 'android',
            model: t.model,
            client: t.clientName || '',
            status: t.online ? 'online' : 'offline',
            connectedAt: t.connectedAt,
            viewerUrl: t.viewerUrl,
            source: 'relay'
          });
        }
      }
    } else {
      relayMsg = 'Relay unreachable';
    }

    const bothFailed = devicesRes.status === 'rejected' && tabletsRes.status === 'rejected';
    if (bothFailed) {
      setErrorMsg(devicesRes.reason instanceof Error ? devicesRes.reason.message : 'Failed to load devices');
      setState('error');
    } else {
      next.sort((a, b) => a.name.localeCompare(b.name));
      setRows(next);
      setRelayNote(relayMsg);
      setLastUpdated(Date.now());
      setState('ready');
    }
    setRefreshing(false);
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 15000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const connect = (r: DeviceRow) => {
    if (r.source === 'relay') {
      if (r.viewerUrl) window.open(r.viewerUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Mac / Windows: native ApexConnect remote desktop (in-console overlay)
      setMeshTarget(r);
    }
  };

  // Every row is connectable: tablets via the relay viewer, RMM devices via ApexConnect.
  const canConnect = (r: DeviceRow) => (r.source === 'relay' ? !!r.viewerUrl : true);

  const startEdit = (r: DeviceRow) => {
    setEditingId(r.id);
    setEditName(r.name === r.id ? '' : r.name);
  };

  const saveEdit = async (r: DeviceRow) => {
    const name = editName.trim();
    setSavingId(r.id);
    try {
      await mdm.renameTablet(r.id, name);
      setRows((prev) => prev.map((d) => (d.id === r.id ? { ...d, name: name || d.id } : d)));
      setEditingId(null);
    } catch {
      /* keep editing open on failure */
    } finally {
      setSavingId(null);
    }
  };

  const online = rows.filter((r) => r.status !== 'offline').length;

  const statusPill = (s: DeviceRow['status']) => {
    const cls =
      s === 'online'
        ? 'bg-[#c8e6c5] text-[#1c4419]'
        : s === 'provisioning'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-[#ececec] text-[#444444]';
    return <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${cls}`}>{s}</span>;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">
      {/* Toolbar */}
      <div className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-emerald-600 bg-emerald-50">
            <Smartphone className="w-4 h-4" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-[#212b36] tracking-tight">Managed Devices</h1>
          <span className="text-xs text-slate-500 font-medium ml-1">({rows.length})</span>
          {state === 'ready' && (
            <span className="hidden sm:inline text-[11px] text-slate-400 ml-2">
              {online} online · tablets, Macs &amp; Windows{lastUpdated ? ` · updated ${relativeTime(lastUpdated)} ago` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {relayNote && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {relayNote}
            </span>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto bg-white custom-scrollbar">
        {state === 'loading' && (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw className="w-7 h-7 mx-auto mb-2 text-slate-300 animate-spin" />
            <div className="text-sm font-semibold text-slate-600">Loading managed devices…</div>
          </div>
        )}

        {state === 'error' && (
          <div className="py-16 px-6 text-center max-w-md mx-auto">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <div className="font-semibold text-slate-700">Can’t load devices right now</div>
            <div className="text-xs text-slate-500 mt-1 font-mono">{errorMsg}</div>
            <button onClick={load} className="mt-3 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold">Retry</button>
          </div>
        )}

        {state === 'ready' && rows.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Smartphone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">No managed devices yet</div>
            <div className="text-xs text-slate-500 mt-1">Tablets appear when their agent connects; Macs &amp; Windows when the RMM agent enrolls.</div>
          </div>
        )}

        {state === 'ready' && rows.length > 0 && (
          <div className="hidden md:block">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-[#f9fafb] text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-2 w-10"></th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Client / Device ID</th>
                  <th className="py-3 px-4">Model / OS</th>
                  <th className="py-3 px-4">Seen</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const meta = OS_META[r.os];
                  const Icon = meta.Icon;
                  return (
                    <tr key={`${r.source}:${r.id}`} className="hover:bg-emerald-50/30 transition">
                      <td className="py-3 px-2 text-center">
                        <Icon className={`w-4 h-4 mx-auto ${meta.color}`} />
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {editingId === r.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(r); if (e.key === 'Escape') setEditingId(null); }}
                              placeholder={r.id}
                              className="border border-slate-300 rounded px-2 py-1 text-xs w-44 outline-none focus:border-emerald-500"
                            />
                            <button onClick={() => saveEdit(r)} disabled={savingId === r.id} className="p-1 rounded bg-emerald-600 text-white disabled:opacity-50" title="Save">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded bg-slate-100 text-slate-600" title="Cancel">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="text-[#011fff] font-bold">{r.name}</span>
                            {r.source === 'relay' && (
                              <button onClick={() => startEdit(r)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition" title="Rename">
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <Icon className={`w-3.5 h-3.5 ${meta.color}`} /> {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">{statusPill(r.status)}</td>
                      <td className="py-3 px-4">
                        {r.client ? <span className="text-slate-700">{r.client}</span> : <span className="font-mono text-slate-500 text-[11px]">{r.id}</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{r.model || '—'}</td>
                      <td className="py-3 px-4 text-slate-500">{r.source === 'relay' ? `${relativeTime(r.connectedAt)} ago` : r.status === 'offline' ? 'offline' : 'live'}</td>
                      <td className="py-3 px-4 text-right">
                        {canConnect(r) ? (
                          <button
                            onClick={() => connect(r)}
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 transition"
                            title={r.source === 'relay' ? 'Open live remote viewer' : 'Open ApexConnect remote desktop'}
                          >
                            <Radio className="w-3 h-3" /> Connect
                            {r.source === 'relay' && <ExternalLink className="w-3 h-3 opacity-60" />}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile cards */}
        {state === 'ready' && rows.length > 0 && (
          <div className="block md:hidden p-3 space-y-2.5">
            {rows.map((r) => {
              const meta = OS_META[r.os];
              const Icon = meta.Icon;
              return (
                <div key={`m:${r.source}:${r.id}`} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-100 shrink-0">
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{r.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{r.client || r.id} · {meta.label}</div>
                      </div>
                    </div>
                    {statusPill(r.status)}
                  </div>
                  {canConnect(r) && (
                    <div className="mt-3 flex items-center justify-end">
                      <button onClick={() => connect(r)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition">
                        <Radio className="w-3.5 h-3.5" /> Connect
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {meshTarget && (
        <ApexConnectDesktop
          deviceId={meshTarget.id}
          deviceName={meshTarget.name}
          clientName={meshTarget.client}
          onClose={() => setMeshTarget(null)}
        />
      )}
    </div>
  );
};

export default ManagedTabletsView;
