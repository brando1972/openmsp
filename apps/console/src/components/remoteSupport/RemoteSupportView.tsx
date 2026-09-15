import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor, RefreshCw, Wifi, ShieldCheck, Laptop, Smartphone, Radio,
  AlertTriangle, Loader2, Cpu, MemoryStick, HardDrive, Clock, ExternalLink, ImageOff
} from 'lucide-react';
import { mesh, mdm, type MeshNodeInfo, type MeshNodeHealth, type MeshTelemetry } from '../../services/api';
import { ApexConnectDesktop } from './ApexConnectDesktop';

type LoadState = 'loading' | 'ready' | 'unconfigured' | 'error';

interface Card {
  key: string;
  kind: 'mesh' | 'tablet';
  nodeid?: string;
  deviceId?: string | null;
  device?: string;
  viewerUrl?: string | null;
  name: string;
  client: string;
  os: 'macos' | 'windows' | 'android' | 'linux' | 'network';
  model?: string;
  online: boolean;
  health?: MeshNodeHealth | null;
  telemetry?: MeshTelemetry | null;
  serial?: string;
}

const INTERVALS = [
  { label: 'Every 2 min', ms: 120000 },
  { label: 'Every 5 min', ms: 300000 },
  { label: 'Every 10 min', ms: 600000 }
];

const OS_ICON = { macos: Laptop, windows: Monitor, android: Smartphone, linux: Monitor, network: Wifi } as const;

const rel = (ms: number | null): string => {
  if (!ms) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

const barColor = (v: number, warn: number, crit: number) =>
  v >= crit ? 'bg-red-500' : v >= warn ? 'bg-amber-500' : 'bg-emerald-500';

const Metric: React.FC<{ icon: React.ElementType; label: string; value: number | null; warn: number; crit: number }> = ({ icon: Icon, label, value, warn, crit }) => (
  <div className="flex items-center gap-2">
    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
    <span className="text-[10px] font-semibold text-slate-500 w-8 shrink-0">{label}</span>
    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
      {value != null && <div className={`h-full rounded-full ${barColor(value, warn, crit)}`} style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />}
    </div>
    <span className="text-[10px] font-bold text-slate-600 w-9 text-right tabular-nums">{value != null ? `${Math.round(value)}%` : '—'}</span>
  </div>
);

// Server-captured desktop screenshot, auto-refreshing on the chosen cadence.
type ThumbFetch = (force: boolean) => Promise<{ blob: Blob; capturedAt: number } | null>;
const DesktopThumb: React.FC<{ fetchThumb: ThumbFetch; cacheKey: string; online: boolean; intervalMs: number; bump: number }> = ({ fetchThumb, cacheKey, online, intervalMs, bump }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const bumpRef = useRef(bump);

  useEffect(() => {
    let alive = true;
    let objUrl: string | null = null;
    const load = async (force: boolean) => {
      if (!online) { setLoading(false); return; }
      setLoading(true);
      try {
        const r = await fetchThumb(force);
        if (!alive) return;
        if (r) {
          const u = URL.createObjectURL(r.blob);
          if (objUrl) URL.revokeObjectURL(objUrl);
          objUrl = u; setSrc(u); setCapturedAt(r.capturedAt);
        }
      } catch { /* keep last */ }
      if (alive) setLoading(false);
    };
    load(bumpRef.current !== bump);
    bumpRef.current = bump;
    const t = setInterval(() => load(false), intervalMs);
    return () => { alive = false; clearInterval(t); if (objUrl) URL.revokeObjectURL(objUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, online, intervalMs, bump]);

  return (
    <div className="relative aspect-[16/10] bg-[#0b0e14] overflow-hidden">
      {src ? (
        <img src={src} alt="desktop" className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-500">
          {online ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageOff className="w-5 h-5" />}
          <span className="text-[10px] font-semibold">{online ? 'Capturing…' : 'Offline'}</span>
        </div>
      )}
      {loading && src && (
        <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1"><Loader2 className="w-3 h-3 animate-spin text-white" /></div>
      )}
      {capturedAt && (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/55 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
          <Clock className="w-2.5 h-2.5" /> {rel(capturedAt)}
        </div>
      )}
    </div>
  );
};

export const RemoteSupportView: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [intervalMs, setIntervalMs] = useState(300000);
  const [bump, setBump] = useState(0);
  const [target, setTarget] = useState<Card | null>(null);

  const load = async () => {
    setRefreshing(true);
    const [nodesRes, tabletsRes] = await Promise.allSettled([mesh.nodes(), mdm.getTablets()]);
    const next: Card[] = [];

    if (nodesRes.status === 'fulfilled') {
      if (!nodesRes.value.configured) { setState('unconfigured'); setRefreshing(false); return; }
      setNote(nodesRes.value.connected ? '' : nodesRes.value.error || 'Remote engine connecting…');
      for (const n of nodesRes.value.nodes as MeshNodeInfo[]) {
        next.push({
          key: 'mesh:' + n.nodeid, kind: 'mesh', nodeid: n.nodeid, deviceId: n.deviceId,
          name: n.name || n.rname || n.nodeid, client: n.clientName || '',
          os: (n.os as Card['os']) || 'macos', online: n.online, health: n.health, telemetry: n.telemetry, serial: n.serial
        });
      }
    } else {
      setNote(nodesRes.reason instanceof Error ? nodesRes.reason.message : 'Failed to reach remote engine');
      setState('error'); setRefreshing(false); return;
    }

    if (tabletsRes.status === 'fulfilled' && tabletsRes.value.configured !== false) {
      for (const t of tabletsRes.value.devices || []) {
        next.push({
          key: 'tablet:' + t.id, kind: 'tablet', device: t.id, viewerUrl: t.viewerUrl,
          name: t.name, client: t.clientName || '', os: 'android', model: t.model, online: t.online
        });
      }
    }

    next.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    setCards(next);
    setState('ready');
    setRefreshing(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const manualRefresh = () => { setBump((b) => b + 1); load(); };

  const connect = (c: Card) => {
    if (c.kind === 'tablet') { if (c.viewerUrl) window.open(c.viewerUrl, '_blank', 'noopener,noreferrer'); }
    else setTarget(c);
  };

  const statusPill = (online: boolean, health?: MeshNodeHealth | null) => {
    if (!online) return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#ececec] text-[#444]">offline</span>;
    const crit = health && health.status && /crit|error|fail/i.test(health.status);
    const warn = health && health.status && /warn|degrad/i.test(health.status);
    const cls = crit ? 'bg-red-100 text-red-700' : warn ? 'bg-amber-100 text-amber-700' : 'bg-[#c8e6c5] text-[#1c4419]';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cls}`}>{health?.status || 'online'}</span>;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f4f6f8]">
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100"><Monitor className="w-5 h-5" /></div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Remote Support</h1>
              <p className="text-xs text-slate-500">Live health &amp; desktop preview · native ApexConnect remote, in-console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
              <Wifi className="w-3.5 h-3.5" /> ApexMSP Group
            </span>
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 cursor-pointer outline-none focus:border-emerald-500"
              title="Screenshot refresh interval"
            >
              {INTERVALS.map((i) => <option key={i.ms} value={i.ms}>{i.label}</option>)}
            </select>
            <button
              onClick={manualRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition disabled:opacity-50"
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
            <div className="text-xs text-slate-500 mt-1.5">Set a MeshCentral service credential (MESH_USER / MESH_PASS) on the control plane.</div>
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

        {state === 'ready' && cards.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Laptop className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">No devices reachable yet</div>
            <div className="text-xs text-slate-500 mt-1">Enroll the ApexConnect agent on a Mac/Windows machine, or connect a tablet, and it appears here.</div>
          </div>
        )}

        {state === 'ready' && cards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => {
              const Icon = OS_ICON[c.os];
              return (
                <div key={c.key} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Preview */}
                  {c.kind === 'mesh' && c.nodeid ? (
                    <DesktopThumb
                      cacheKey={'m:' + c.nodeid}
                      online={c.online}
                      intervalMs={intervalMs}
                      bump={bump}
                      fetchThumb={(f) => mesh.thumbnailBlob({ nodeid: c.nodeid!, maxAgeSec: Math.round(intervalMs / 1000), refresh: f })}
                    />
                  ) : c.kind === 'tablet' && c.online && c.device ? (
                    <DesktopThumb
                      cacheKey={'t:' + c.device}
                      online={c.online}
                      intervalMs={intervalMs}
                      bump={bump}
                      fetchThumb={(f) => mdm.thumbnailBlob({ device: c.device!, maxAgeSec: Math.round(intervalMs / 1000), refresh: f })}
                    />
                  ) : (
                    <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-1.5 text-slate-300">
                      <Smartphone className={`w-7 h-7 ${c.online ? '' : 'opacity-50'}`} />
                      <span className="text-[10px] font-semibold">{c.online ? `${c.model || 'Android'} · live view on Connect` : 'Offline · not connected to relay'}</span>
                    </div>
                  )}

                  {/* Body */}
                  <div className="p-3.5 flex flex-col gap-3 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate leading-tight">{c.name}</div>
                          <div className="text-[11px] text-slate-500 truncate leading-tight">{c.client || (c.serial ? c.serial : '—')}</div>
                        </div>
                      </div>
                      {statusPill(c.online, c.health)}
                    </div>

                    {c.kind === 'mesh' && c.health ? (
                      <div className="flex flex-col gap-1.5">
                        <Metric icon={Cpu} label="CPU" value={c.health.cpu} warn={70} crit={90} />
                        <Metric icon={MemoryStick} label="RAM" value={c.health.ram} warn={75} crit={90} />
                        <Metric icon={HardDrive} label="Disk" value={c.health.disk} warn={80} crit={92} />
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                          <span>Last seen {rel(c.health.lastSeen ? new Date(c.health.lastSeen).getTime() : null)}</span>
                          {c.health.uptimeDays != null && <span>up {Math.round(c.health.uptimeDays)}d</span>}
                        </div>
                      </div>
                    ) : c.kind === 'mesh' && c.telemetry ? (
                      <div className="flex flex-col gap-1.5">
                        {c.telemetry.ramUsedPct != null && <Metric icon={MemoryStick} label="RAM" value={c.telemetry.ramUsedPct} warn={75} crit={90} />}
                        {c.telemetry.diskPct != null && <Metric icon={HardDrive} label="Disk" value={c.telemetry.diskPct} warn={80} crit={92} />}
                        <div className="flex flex-col gap-0.5 mt-0.5 text-[10px] text-slate-500 leading-snug">
                          {c.telemetry.os && <div className="flex items-center gap-1.5"><Monitor className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{c.telemetry.os}</span></div>}
                          {c.telemetry.cpu && <div className="flex items-center gap-1.5"><Cpu className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{c.telemetry.cpu}</span></div>}
                          {(c.telemetry.ramGB || c.telemetry.diskTotalGB) && (
                            <div className="flex items-center gap-1.5"><HardDrive className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{[c.telemetry.ramGB ? `${c.telemetry.ramGB} GB RAM` : '', c.telemetry.diskTotalGB ? `${c.telemetry.diskTotalGB} GB disk` : ''].filter(Boolean).join(' · ')}</span></div>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">Inventory via ApexConnect agent · live CPU/RAM needs the RMM agent</div>
                      </div>
                    ) : c.kind === 'mesh' ? (
                      <div className="text-[11px] text-slate-400 py-1">Remote desktop ready · telemetry loading…</div>
                    ) : (
                      <div className="text-[11px] text-slate-500 py-1">{c.model && c.model !== 'Android tablet' ? `Android tablet · ${c.model}` : 'Android tablet'}</div>
                    )}

                    <button
                      onClick={() => connect(c)}
                      disabled={!c.online}
                      className="mt-auto w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Radio className="w-3.5 h-3.5" /> Connect
                      {c.kind === 'tablet' && <ExternalLink className="w-3 h-3 opacity-70" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 pb-4 shrink-0 hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        Screenshots are captured server-side by the control plane every few minutes · remote desktop renders natively in ApexMSP
      </div>

      {target && target.kind === 'mesh' && (
        <ApexConnectDesktop
          nodeid={target.nodeid}
          deviceId={target.deviceId || undefined}
          deviceName={target.name}
          clientName={target.client}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
};

export default RemoteSupportView;
