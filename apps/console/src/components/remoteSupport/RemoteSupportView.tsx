import React, { useEffect, useState } from 'react';
import {
  Monitor,
  RefreshCw,
  Wifi,
  ShieldCheck,
  Laptop,
  Radio,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { mesh, type MeshNodeInfo } from '../../services/api';
import { ApexConnectDesktop } from './ApexConnectDesktop';

/**
 * Remote Support — NATIVE ApexConnect.
 * ---------------------------------------------------------------------------
 * No embedded MeshCentral UI. This lists the machines reachable by the
 * ApexConnect agent and launches the in-console native remote desktop
 * (ApexConnectDesktop) for exactly one device at a time.
 */

type LoadState = 'loading' | 'ready' | 'unconfigured' | 'error';

export const RemoteSupportView: React.FC = () => {
  const [nodes, setNodes] = useState<MeshNodeInfo[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<MeshNodeInfo | null>(null);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await mesh.nodes();
      if (!res.configured) {
        setState('unconfigured');
      } else {
        setNodes(res.nodes || []);
        setNote(res.connected ? '' : res.error || 'Remote engine connecting…');
        setState('ready');
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Failed to reach remote engine');
      setState('error');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const label = (n: MeshNodeInfo) => n.name || n.rname || n.nodeid;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f4f6f8]">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Remote Support</h1>
              <p className="text-xs text-slate-500">
                Native ApexConnect remote desktop &middot; renders in-console, no external window
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
              <Wifi className="w-3.5 h-3.5" /> ApexMSP Group
            </span>
            <button
              onClick={load}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {note && state === 'ready' && (
          <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 text-[12px] text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {note}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-6 pb-6 overflow-auto">
        {state === 'loading' && (
          <div className="py-20 text-center text-slate-400">
            <Loader2 className="w-7 h-7 mx-auto mb-2 animate-spin text-emerald-500" />
            <div className="text-sm font-semibold text-slate-600">Loading devices…</div>
          </div>
        )}

        {state === 'unconfigured' && (
          <div className="py-16 px-6 text-center max-w-lg mx-auto">
            <ShieldCheck className="w-9 h-9 mx-auto mb-2 text-slate-400" />
            <div className="font-semibold text-slate-700">ApexConnect remote engine not configured</div>
            <div className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Set a MeshCentral service account (MESH_USER / MESH_PASS) on the control plane so the
              console can broker native remote sessions. Once configured, every device with the
              ApexConnect agent appears here.
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="py-16 px-6 text-center max-w-md mx-auto">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <div className="font-semibold text-slate-700">Can’t reach the remote engine</div>
            <div className="text-xs text-slate-500 mt-1 font-mono">{note}</div>
            <button onClick={load} className="mt-3 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold">Retry</button>
          </div>
        )}

        {state === 'ready' && nodes.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Laptop className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">No devices reachable yet</div>
            <div className="text-xs text-slate-500 mt-1">Install the ApexConnect agent on a Mac or Windows machine and it will appear here.</div>
          </div>
        )}

        {state === 'ready' && nodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nodes.map((n) => (
              <div key={n.nodeid} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{label(n)}</div>
                      <div className="text-[11px] text-slate-500 truncate">{n.host || n.rname || '—'}</div>
                    </div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${n.online ? 'bg-[#c8e6c5] text-[#1c4419]' : 'bg-[#ececec] text-[#444444]'}`}>
                    {n.online ? 'online' : 'offline'}
                  </span>
                </div>
                <button
                  onClick={() => setTarget(n)}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Radio className="w-3.5 h-3.5" /> Connect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 pb-4 shrink-0 hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        Secured over Cloudflare &middot; the remote desktop renders natively inside ApexMSP — no MeshCentral console
      </div>

      {target && (
        <ApexConnectDesktop
          nodeid={target.nodeid}
          deviceName={label(target)}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
};

export default RemoteSupportView;
