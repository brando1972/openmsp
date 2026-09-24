import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor, RefreshCw, Wifi, ShieldCheck, Laptop, Smartphone, Radio,
  AlertTriangle, Loader2, Cpu, MemoryStick, HardDrive, Clock, ExternalLink, ImageOff,
  X, Maximize2, Wrench, Building2, Battery, BatteryCharging, SlidersHorizontal, RotateCcw, Plus,
  User, Zap
} from 'lucide-react';
import { mesh, mdm, type MeshNodeInfo, type MeshNodeHealth, type MeshTelemetry, type MeshAgentStatus, type TabletDetails } from '../../services/api';
import { useApp } from '../../data/AppContext';
import { ApexConnectDesktop } from './ApexConnectDesktop';
import { BackstageModal } from '../rmm/backstage';
import { ManagedDevice } from '../../types';

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
  clientId?: string | null;
  os: 'macos' | 'windows' | 'android' | 'linux' | 'network';
  model?: string;
  online: boolean;
  health?: MeshNodeHealth | null;
  telemetry?: MeshTelemetry | null;
  agents?: MeshAgentStatus;
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

// Rich telemetry + Headwind profile control for an Android tablet.
const TabletPanel: React.FC<{ device: string; model?: string }> = ({ device, model }) => {
  const [d, setD] = useState<TabletDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [rebooting, setRebooting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => { try { const r = await mdm.getDetails(device); if (alive) setD(r); } catch { /* ignore */ } };
    load(); const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [device]);

  const t = d?.telemetry || null;
  const bat = t?.batteryLevel ?? null;
  const charging = !!(t?.charging && /charg|full/i.test(t.charging));
  const batColor = bat == null ? 'bg-slate-300' : bat <= 15 ? 'bg-red-500' : bat <= 35 ? 'bg-amber-500' : 'bg-emerald-500';
  const ramPct = t && t.ramTotalMb && t.ramAvailMb != null ? Math.min(100, Math.max(0, Math.round((1 - t.ramAvailMb / t.ramTotalMb) * 100))) : null;
  const ramUsedGb = t && t.ramTotalMb && t.ramAvailMb != null ? ((t.ramTotalMb - t.ramAvailMb) / 1024).toFixed(1) : null;
  const ramTotGb = t && t.ramTotalMb ? (t.ramTotalMb / 1024).toFixed(1) : null;
  const net = t?.wifi ? (t.ssid || 'Wi-Fi') : t?.mobiledata ? (t.carrier || 'Cellular') : null;
  const curId = d?.device?.configurationId ?? null;
  const profiles = d?.profiles || [];

  const applyProfile = async (cid: number) => {
    setSaving(true); setMsg('');
    try {
      const r = await mdm.setProfile(device, cid);
      setMsg(r.ok ? 'Profile queued — applies on next check-in' : 'Failed to set profile');
      const rr = await mdm.getDetails(device); setD(rr);
    } catch { setMsg('Failed to set profile'); }
    finally { setSaving(false); }
  };

  const doReboot = async () => {
    if (rebooting) return;
    if (!window.confirm('Reboot this tablet now? It will restart on its next check-in.')) return;
    setRebooting(true); setMsg('');
    try {
      const r = await mdm.reboot(device);
      setMsg(r.ok ? 'Reboot queued — restarts on next check-in' : 'Failed to queue reboot');
    } catch { setMsg('Failed to queue reboot'); }
    finally { setRebooting(false); }
  };

  const onProfileCreated = async () => {
    setShowNew(false);
    const rr = await mdm.getDetails(device); setD(rr);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Battery gauge */}
      <div className="flex items-center gap-2">
        {charging ? <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0" /> : <Battery className="w-4 h-4 text-slate-400 shrink-0" />}
        <div className="relative flex-1 h-4 rounded-md bg-slate-100 border border-slate-200 overflow-hidden">
          {bat != null && <div className={`h-full ${batColor} transition-all`} style={{ width: `${bat}%` }} />}
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 tabular-nums">
            {bat != null ? `${bat}%${charging ? ' · charging' : ''}` : 'battery —'}
          </span>
        </div>
      </div>
      {/* RAM gauge */}
      <Metric icon={MemoryStick} label="RAM" value={ramPct} warn={75} crit={90} />
      {/* facts */}
      <div className="flex flex-col gap-0.5 text-[10px] text-slate-500 leading-snug">
        {net && <div className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{net}{t?.wifiRssi != null ? ` · ${t.wifiRssi} dBm` : ''}</span></div>}
        {(ramUsedGb && ramTotGb) && <div className="flex items-center gap-1.5"><HardDrive className="w-3 h-3 text-slate-400 shrink-0" /><span>{ramUsedGb} / {ramTotGb} GB RAM</span></div>}
        <div className="flex items-center gap-1.5"><Smartphone className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{model && model !== 'Android tablet' ? model : 'Android tablet'}</span></div>
      </div>
      {/* Profile selector */}
      {d?.configured && profiles.length > 0 && (
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={curId ?? ''}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new__') { setShowNew(true); return; }
              if (v) applyProfile(parseInt(v, 10));
            }}
            className="flex-1 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer outline-none focus:border-emerald-500"
            title="Headwind profile"
          >
            {curId == null && <option value="">Set profile…</option>}
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kioskMode ? ' · kiosk' : ''}</option>)}
            <option value="__new__">＋ New profile…</option>
          </select>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
      )}
      {/* Reboot */}
      {d?.configured && d?.device && (
        <button
          onClick={doReboot}
          disabled={rebooting}
          className="flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
          title="Reboot tablet"
        >
          {rebooting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Reboot
        </button>
      )}
      {msg && <div className="text-[10px] text-emerald-600 font-semibold">{msg}</div>}
      {!t && d?.configured && <div className="text-[10px] text-slate-400">Telemetry populates within ~5 min of the next check-in.</div>}
      {showNew && <NewProfileDialog profiles={profiles} onClose={() => setShowNew(false)} onCreated={onProfileCreated} />}
    </div>
  );
};

// Dialog: create a new Headwind profile by cloning an existing configuration.
const NewProfileDialog: React.FC<{ profiles: { id: number; name: string; kioskMode: boolean }[]; onClose: () => void; onCreated: () => void }> = ({ profiles, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [baseId, setBaseId] = useState<number | ''>(profiles[0]?.id ?? '');
  const [kioskMode, setKioskMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    if (!name.trim() || baseId === '') { setErr('Name and base profile are required'); return; }
    setBusy(true); setErr('');
    try {
      const r = await mdm.createProfile({ name: name.trim(), baseConfigId: Number(baseId), kioskMode });
      if (r.ok) onCreated(); else setErr('Failed to create profile');
    } catch { setErr('Failed to create profile'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Plus className="w-4 h-4 text-emerald-600" /></div>
          <div className="text-base font-bold text-slate-800">New profile</div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Profile name</span>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Front Desk Kiosk"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Clone from</span>
          <select
            value={baseId} onChange={(e) => setBaseId(e.target.value ? parseInt(e.target.value, 10) : '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-emerald-500 cursor-pointer"
          >
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kioskMode ? ' · kiosk' : ''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={kioskMode} onChange={(e) => setKioskMode(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          <span className="text-sm text-slate-700">Kiosk mode (lock to a single app)</span>
        </label>
        {err && <div className="text-xs text-red-600 font-semibold">{err}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={create} disabled={busy} className="text-sm font-semibold text-white px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create profile
          </button>
        </div>
      </div>
    </div>
  );
};

export const RemoteSupportView: React.FC = () => {
  const { clients, selectedClientId, devices } = useApp();
  const [cards, setCards] = useState<Card[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [intervalMs, setIntervalMs] = useState(300000);
  const [bump, setBump] = useState(0);
  const [target, setTarget] = useState<Card | null>(null);
  const [backstageDevice, setBackstageDevice] = useState<ManagedDevice | null>(null);
  const [tabletViewer, setTabletViewer] = useState<{ url: string; name: string; device?: string } | null>(null);
  const [viewerRebooting, setViewerRebooting] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({}); // per-card action-in-progress label
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const deviceForCard = (c: Card): ManagedDevice => {
    const existing = devices.find(d => (c.deviceId && d.id === c.deviceId) || (d.hostname && d.hostname.toLowerCase() === c.name.toLowerCase()));
    if (existing) return existing;
    const isTablet = c.kind === 'tablet';
    return {
      id: c.deviceId || c.nodeid || c.key,
      name: c.name,
      hostname: c.name,
      clientId: isTablet ? 'c-brandon-ray' : (c.clientId || 'client-default'),
      clientName: isTablet ? 'Brandon Ray' : (c.client || 'Default Client'),
      siteName: 'Default Site',
      os: isTablet ? 'android' : ((c.os as any) || 'windows'),
      osVersion: isTablet ? 'Android 14 (Enterprise)' : (c.telemetry?.os || ''),
      serialNumber: isTablet ? 'HA1A99Z2' : (c.telemetry?.serial || ''),
      ipAddress: isTablet ? '192.168.4.200' : '192.168.2.252',
      publicIp: isTablet ? '192.168.4.200' : '',
      macAddress: isTablet ? '62:f1:fa:12:9b:d9' : '',
      health: c.online ? 'healthy' : 'offline',
      metrics: { cpuUsage: 10, ramUsage: 40, diskUsage: 50, uptimeDays: 1, lastSeen: new Date().toISOString() },
      rustDeskId: '',
      rustDeskOnline: false,
      mdmEnrolled: isTablet,
      encryptionStatus: 'encrypted',
      patchCompliance: 100,
      pendingPatchesCount: 0,
      loggedInUser: isTablet ? 'Brandon Ray' : (c.telemetry?.loggedInUser || undefined),
      domain: isTablet ? 'ApexMSP Mobile' : (c.telemetry?.domain || undefined),
      services: [],
      installedApps: [],
      eventLogs: [],
      tags: isTablet ? ['tablet', 'android', 'kiosk'] : []
    };
  };

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
          name: n.name || n.rname || n.nodeid, client: n.clientName || '', clientId: n.clientId ?? null,
          os: (n.os as Card['os']) || 'macos', online: n.online, health: n.health, telemetry: n.telemetry,
          agents: n.agents, serial: n.serial
        });
      }
    } else {
      setNote(nodesRes.reason instanceof Error ? nodesRes.reason.message : 'Failed to reach remote engine');
      setState('error'); setRefreshing(false); return;
    }

    if (tabletsRes.status === 'fulfilled' && tabletsRes.value.configured !== false) {
      const realTablets = tabletsRes.value.devices || [];
      if (realTablets.length > 0) {
        for (const t of realTablets) {
          const tabletClientId = (t.clientId && t.clientId !== 'c-raytreat' && t.clientId !== 'c-richs') ? t.clientId : (selectedClientId !== 'all' ? selectedClientId : 'c-brandon-ray');
          const tabletClientName = (t.clientName && t.clientId !== 'c-raytreat' && t.clientId !== 'c-richs') ? t.clientName : 'Brandon Ray';
          const tabletName = (t.name === 'Raytreat Lenovo Kiosk' || t.id === 'apex-lenovo-01' || t.id === 'HNQ01Q1C') ? 'Lenovo Tab TB373FU' : t.name;
          next.push({
            key: 'tablet:' + t.id,
            kind: 'tablet',
            device: 'Robertsdale',
            viewerUrl: t.viewerUrl || 'https://vnc.apexmsp.app/?device=bdf535e319cf5501',
            name: tabletName,
            client: tabletClientName,
            clientId: tabletClientId,
            os: 'android',
            model: t.model || 'Lenovo Tab TB373FU (Android 14)',
            online: true
          });
        }
      } else {
        next.push({
          key: 'tablet:apex-lenovo-01',
          kind: 'tablet',
          device: 'Robertsdale',
          viewerUrl: 'https://vnc.apexmsp.app/?device=bdf535e319cf5501',
          name: 'Lenovo Tab TB373FU',
          client: 'Brandon Ray',
          clientId: 'c-brandon-ray',
          os: 'android',
          model: 'Lenovo Tab TB373FU (Android 14)',
          online: true
        });
      }
    }

    next.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    setCards(next);
    setState('ready');
    setRefreshing(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const manualRefresh = () => { setBump((b) => b + 1); load(); };

  // Top-nav client filter: show only the selected client's devices ('all' shows everything).
  const visibleCards = selectedClientId === 'all'
    ? cards
    : cards.filter((c) => c.clientId === selectedClientId || (!c.clientId || c.clientId === 'c-raytreat'));

  const assign = async (c: Card, clientId: string) => {
    setBusy((b) => ({ ...b, [c.key]: 'assign' }));
    try {
      if (c.kind === 'mesh' && c.nodeid) {
        const r = await mesh.assignClient(c.nodeid, clientId);
        setToast({ kind: 'ok', text: clientId ? `Assigned ${c.name} to ${r.clientName}` : `Cleared ${c.name}'s client` });
      } else if (c.kind === 'tablet' && c.device) {
        const r = await mdm.assignClient(c.device, clientId);
        setToast({ kind: 'ok', text: clientId ? `Assigned ${c.name} to ${r.clientName}` : `Cleared ${c.name}'s client` });
      }
      await load();
    } catch {
      setToast({ kind: 'err', text: `Couldn't assign ${c.name}` });
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[c.key]; return n; });
    }
  };

  const repair = async (c: Card, agent: 'rmm' | 'mesh') => {
    if (!c.nodeid) return;
    setBusy((b) => ({ ...b, [c.key]: 'repair:' + agent }));
    try {
      const r = await mesh.repair(c.nodeid, agent);
      setToast({ kind: r.ok ? 'ok' : 'err', text: r.detail });
    } catch {
      setToast({ kind: 'err', text: 'Repair request failed' });
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[c.key]; return n; });
    }
  };

  const connect = (c: Card) => {
    if (c.kind === 'tablet') { if (c.viewerUrl) setTabletViewer({ url: c.viewerUrl, name: c.name, device: c.device }); }
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

        {state === 'ready' && cards.length > 0 && visibleCards.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <div className="font-semibold text-slate-700">No devices for this client</div>
            <div className="text-xs text-slate-500 mt-1">
              {cards.length} device{cards.length === 1 ? '' : 's'} in other clients are hidden by the filter. Switch to “All MSP Clients” to see them.
            </div>
          </div>
        )}

        {state === 'ready' && visibleCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCards.map((c) => {
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
                          {c.telemetry.loggedInUser && (
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <User className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="truncate">{c.telemetry.loggedInUser}</span>
                              {c.telemetry.domain && (
                                <span className="text-[9px] px-1 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-mono uppercase">
                                  {c.telemetry.domain}
                                </span>
                              )}
                            </div>
                          )}
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
                    ) : c.device ? (
                      <TabletPanel device={c.device} model={c.model} />
                    ) : (
                      <div className="text-[11px] text-slate-500 py-1">{c.model && c.model !== 'Android tablet' ? `Android tablet · ${c.model}` : 'Android tablet'}</div>
                    )}

                    {/* Dual-agent status — both channels at a glance (fused RMM + ApexConnect) */}
                    {c.kind === 'mesh' && c.agents && (
                      <div className="flex items-center gap-3 text-[10px] font-semibold">
                        <span className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.agents.rmm.state === 'online' ? 'bg-emerald-500' : c.agents.rmm.state === 'offline' ? 'bg-red-500' : 'bg-slate-300'}`} />
                          <span className="text-slate-500">RMM {c.agents.rmm.state === 'absent' ? 'not deployed' : c.agents.rmm.state}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.agents.mesh.state === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-slate-500">ApexConnect {c.agents.mesh.state}</span>
                        </span>
                      </div>
                    )}

                    {/* Cross-agent repair: fix a down agent through the healthy one */}
                    {c.kind === 'mesh' && c.agents && c.agents.mesh.state === 'online' && c.agents.rmm.state === 'offline' && (
                      <button onClick={() => repair(c, 'rmm')} disabled={!!busy[c.key]}
                        className="w-full px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-amber-100 transition disabled:opacity-50">
                        {busy[c.key] === 'repair:rmm' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />} Restart RMM agent via ApexConnect
                      </button>
                    )}
                    {c.kind === 'mesh' && c.agents && c.agents.mesh.state === 'offline' && c.agents.rmm.state === 'online' && (
                      <button onClick={() => repair(c, 'mesh')} disabled={!!busy[c.key]}
                        className="w-full px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-amber-100 transition disabled:opacity-50">
                        {busy[c.key] === 'repair:mesh' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />} Restart ApexConnect via RMM agent
                      </button>
                    )}

                    {/* Assign an un-cliented mesh node or tablet to a client org */}
                    {(!c.clientId || c.clientId === 'c-raytreat') && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <select
                          defaultValue={c.clientId || ''}
                          disabled={busy[c.key] === 'assign'}
                          onChange={(e) => { if (e.target.value) assign(c, e.target.value); }}
                          className="flex-1 text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer outline-none focus:border-emerald-500"
                        >
                          <option value="">Assign to client…</option>
                          {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                        </select>
                        {busy[c.key] === 'assign' && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      </div>
                    )}

                    <div className="mt-auto flex items-center gap-1.5">
                      <button
                        onClick={() => connect(c)}
                        disabled={c.kind === 'tablet' ? !c.viewerUrl : !c.online}
                        className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                      >
                        <Radio className="w-3.5 h-3.5" /> {c.kind === 'tablet' ? 'Remote View' : 'Connect'}
                        {c.kind === 'tablet' && <ExternalLink className="w-3 h-3 opacity-70" />}
                      </button>

                      {c.kind === 'mesh' && (
                        <button
                          onClick={() => setBackstageDevice(deviceForCard(c))}
                          disabled={!c.online}
                          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                          title="ScreenConnect Backstage (Silent Task Manager, Services, Files, Terminal)"
                        >
                          <Zap className="w-3.5 h-3.5" /> Backstage
                        </button>
                      )}
                    </div>
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

      {backstageDevice && (
        <BackstageModal
          device={backstageDevice}
          isOpen={!!backstageDevice}
          onClose={() => setBackstageDevice(null)}
        />
      )}

      {/* Android tablet remote — relay viewer embedded in ApexConnect chrome (in-console, not a new tab) */}
      {tabletViewer && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div ref={viewerRef} className="relative w-full h-full sm:h-[92vh] sm:max-w-[1200px] bg-[#0b0e14] sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
            <div className="h-12 shrink-0 bg-[#10141c] border-b border-slate-800 flex items-center justify-between px-3 sm:px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate leading-tight">{tabletViewer.name}</div>
                  <div className="text-[11px] text-slate-400 truncate leading-tight">ApexConnect remote · Android</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {tabletViewer.device && (
                  <button
                    onClick={async () => {
                      const dev = tabletViewer.device; if (!dev || viewerRebooting) return;
                      if (!window.confirm('Reboot this tablet now? It will restart on its next check-in.')) return;
                      setViewerRebooting(true);
                      try { const r = await mdm.reboot(dev); setToast({ kind: r.ok ? 'ok' : 'err', text: r.ok ? 'Reboot queued — restarts on next check-in' : 'Failed to queue reboot' }); }
                      catch { setToast({ kind: 'err', text: 'Failed to queue reboot' }); }
                      finally { setViewerRebooting(false); }
                    }}
                    disabled={viewerRebooting} title="Reboot tablet"
                    className="h-8 px-2.5 rounded-lg bg-slate-800/70 hover:bg-red-500/30 text-slate-200 hover:text-red-300 flex items-center gap-1.5 text-xs font-semibold transition disabled:opacity-50">
                    {viewerRebooting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    <span className="hidden sm:inline">Reboot</span>
                  </button>
                )}
                <a href={tabletViewer.url} target="_blank" rel="noreferrer" title="Open in new tab"
                   className="h-8 w-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button onClick={() => { const el = viewerRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.(); }}
                        title="Fullscreen" className="h-8 w-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition">
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button onClick={() => setTabletViewer(null)} title="Close"
                        className="h-8 w-8 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-300 flex items-center justify-center transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={tabletViewer.url}
              title={tabletViewer.name}
              className="flex-1 w-full border-0 bg-black"
              allow="fullscreen; clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[120] max-w-sm px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-start gap-2 ${toast.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {toast.kind === 'ok' ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};

export default RemoteSupportView;
