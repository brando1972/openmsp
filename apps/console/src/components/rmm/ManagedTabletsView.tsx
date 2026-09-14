import React, { useEffect, useRef, useState } from 'react';
import {
  Smartphone,
  Radio,
  RefreshCw,
  Pencil,
  Check,
  X,
  ExternalLink,
  AlertTriangle,
  Tablet
} from 'lucide-react';
import { mdm, type ManagedTablet } from '../../services/api';

type LoadState = 'loading' | 'ready' | 'error' | 'unconfigured';

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

export const ManagedTabletsView: React.FC = () => {
  const [tablets, setTablets] = useState<ManagedTablet[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      setRefreshing(true);
      const res = await mdm.getTablets();
      if (!res.configured) {
        setState('unconfigured');
        setTablets([]);
        return;
      }
      setTablets(res.devices || []);
      setLastUpdated(Date.now());
      setState('ready');
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reach relay');
      setState((prev) => (prev === 'loading' ? 'error' : prev));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 15000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const connect = (t: ManagedTablet) => {
    if (t.viewerUrl) window.open(t.viewerUrl, '_blank', 'noopener,noreferrer');
  };

  const startEdit = (t: ManagedTablet) => {
    setEditingId(t.id);
    setEditName(t.name === t.id ? '' : t.name);
  };

  const saveEdit = async (t: ManagedTablet) => {
    const name = editName.trim();
    setSavingId(t.id);
    try {
      await mdm.renameTablet(t.id, name);
      setTablets((prev) => prev.map((d) => (d.id === t.id ? { ...d, name: name || d.id } : d)));
      setEditingId(null);
    } catch {
      // keep editing open on failure
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">
      {/* Toolbar */}
      <div className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-emerald-600 bg-emerald-50">
            <Tablet className="w-4 h-4" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-[#212b36] tracking-tight">Managed Tablets</h1>
          <span className="text-xs text-slate-500 font-medium ml-1">({tablets.length})</span>
          {state === 'ready' && (
            <span className="hidden sm:inline text-[11px] text-slate-400 ml-2">
              MDM · live from relay{lastUpdated ? ` · updated ${relativeTime(lastUpdated)} ago` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Relay
          </span>
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
            <div className="text-sm font-semibold text-slate-600">Loading managed tablets…</div>
          </div>
        )}

        {state === 'unconfigured' && (
          <div className="py-16 px-6 text-center max-w-md mx-auto">
            <Smartphone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">MDM relay not configured</div>
            <div className="text-xs text-slate-500 mt-1">
              Set <code className="font-mono text-slate-700">RELAY_URL</code> and{' '}
              <code className="font-mono text-slate-700">RELAY_ADMIN_TOKEN</code> on the control plane to list live tablets.
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="py-16 px-6 text-center max-w-md mx-auto">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <div className="font-semibold text-slate-700">Can’t reach the relay right now</div>
            <div className="text-xs text-slate-500 mt-1 font-mono">{errorMsg}</div>
            <button onClick={load} className="mt-3 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold">Retry</button>
          </div>
        )}

        {state === 'ready' && tablets.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Smartphone className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">No tablets online</div>
            <div className="text-xs text-slate-500 mt-1">Tablets appear here the moment their agent connects to the relay.</div>
          </div>
        )}

        {state === 'ready' && tablets.length > 0 && (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden p-3 space-y-2.5">
              {tablets.map((t) => (
                <div key={t.id} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{t.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{t.id}</div>
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#c8e6c5] text-[#1c4419]">Online</span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div><span className="text-slate-400 text-[10px] block">MODEL</span><span className="truncate block">{t.model || '—'}</span></div>
                    <div><span className="text-slate-400 text-[10px] block">CONNECTED</span><span className="truncate block">{relativeTime(t.connectedAt)} ago</span></div>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => connect(t)}
                      disabled={!t.viewerUrl}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Radio className="w-3.5 h-3.5" /> Connect
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-left text-xs text-slate-700 border-collapse">
                <thead className="bg-[#f9fafb] text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-2 w-10"></th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Serial / Device ID</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">Connected</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tablets.map((t) => (
                    <tr key={t.id} className="hover:bg-emerald-50/30 transition">
                      <td className="py-3 px-2 text-center">
                        <Smartphone className="w-4 h-4 text-emerald-500 mx-auto" />
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {editingId === t.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(t); if (e.key === 'Escape') setEditingId(null); }}
                              placeholder={t.id}
                              className="border border-slate-300 rounded px-2 py-1 text-xs w-44 outline-none focus:border-emerald-500"
                            />
                            <button onClick={() => saveEdit(t)} disabled={savingId === t.id} className="p-1 rounded bg-emerald-600 text-white disabled:opacity-50" title="Save">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded bg-slate-100 text-slate-600" title="Cancel">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <span className="text-[#011fff] font-bold">{t.name}</span>
                            <button onClick={() => startEdit(t)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition" title="Rename">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-[#c8e6c5] text-[#1c4419]">Online</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{t.id}</td>
                      <td className="py-3 px-4 text-slate-600">{t.model || '—'}</td>
                      <td className="py-3 px-4 text-slate-500">{relativeTime(t.connectedAt)} ago</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => connect(t)}
                            disabled={!t.viewerUrl}
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1 transition"
                            title="Open live remote viewer"
                          >
                            <Radio className="w-3 h-3" /> Connect <ExternalLink className="w-3 h-3 opacity-60" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ManagedTabletsView;
