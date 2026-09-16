import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Router, Network as NetworkIcon, Wifi, Printer, Video, HardDrive, Laptop,
  Smartphone, Cpu, HelpCircle, RefreshCw, Radar, Loader2, X, Globe, TerminalSquare,
  MonitorSmartphone, Search, SlidersHorizontal, Server
} from 'lucide-react';
import { net, type NetHost, type NetNeighbor, type NetSite, type NetConfig } from '../../services/api';

// ---- role presentation -------------------------------------------------------
type Role = 'router' | 'switch' | 'ap' | 'printer' | 'camera' | 'nas' | 'workstation' | 'phone' | 'iot' | 'unknown';

type IconCmp = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
const ROLE: Record<string, { label: string; Icon: IconCmp; color: string; tier: number }> = {
  router:      { label: 'Router',      Icon: Router,            color: '#6366f1', tier: 0 },
  switch:      { label: 'Switch',      Icon: NetworkIcon,       color: '#0ea5e9', tier: 1 },
  ap:          { label: 'Access Point',Icon: Wifi,              color: '#06b6d4', tier: 2 },
  printer:     { label: 'Printer',     Icon: Printer,           color: '#f59e0b', tier: 3 },
  camera:      { label: 'Camera',      Icon: Video,             color: '#ef4444', tier: 3 },
  nas:         { label: 'NAS',         Icon: HardDrive,         color: '#8b5cf6', tier: 3 },
  workstation: { label: 'Workstation', Icon: Laptop,            color: '#10b981', tier: 3 },
  phone:       { label: 'Phone',       Icon: Smartphone,        color: '#14b8a6', tier: 3 },
  iot:         { label: 'IoT',         Icon: Cpu,               color: '#a3a3a3', tier: 3 },
  unknown:     { label: 'Unknown',     Icon: HelpCircle,        color: '#94a3b8', tier: 3 }
};
const roleOf = (h: NetHost): Role => (ROLE[h.role || 'unknown'] ? (h.role as Role) : 'unknown');
const nameOf = (h: NetHost) => h.hostname || h.sysName || (h.ips && h.ips[0]) || h.mac || 'device';

// A discovered host can carry web / ssh affordances the tunnel can open.
const webPort = (h: NetHost): number | null => {
  const p = h.openPorts || [];
  if (p.includes(443)) return 443;
  if (p.includes(80)) return 80;
  if (p.includes(8443)) return 8443;
  if (p.includes(8080)) return 8080;
  return null;
};
const hasSsh = (h: NetHost) => (h.openPorts || []).includes(22);

// ---- layout ------------------------------------------------------------------
interface Node { h: NetHost; x: number; y: number; }
interface Edge { a: Node; b: Node; source: string; }

function keyFor(h: NetHost) { return (h.mac || h.ips?.[0] || nameOf(h)).toLowerCase(); }

function layout(hosts: NetHost[], neighbors: NetNeighbor[]): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
  const tiers: Record<number, NetHost[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const h of hosts) tiers[ROLE[roleOf(h)].tier].push(h);

  const COL = 150, ROW = 130, PAD = 80;
  const perRow = Math.max(6, Math.ceil(Math.sqrt(tiers[3].length || 1)) + 3);
  const nodes: Node[] = [];
  const place = (list: NetHost[], tier: number, yBase: number, wrap: boolean) => {
    if (!list.length) return yBase;
    if (!wrap) {
      const totalW = (list.length - 1) * COL;
      list.forEach((h, i) => nodes.push({ h, x: PAD + i * COL - totalW / 2, y: yBase }));
      return yBase + ROW;
    }
    let y = yBase;
    for (let i = 0; i < list.length; i += perRow) {
      const row = list.slice(i, i + perRow);
      const totalW = (row.length - 1) * COL;
      row.forEach((h, j) => nodes.push({ h, x: PAD + j * COL - totalW / 2, y }));
      y += ROW;
    }
    return y;
  };
  let y = PAD;
  y = place(tiers[0], 0, y, false);
  y = place(tiers[1], 1, y, false);
  y = place(tiers[2], 2, y, false);
  y = place(tiers[3], 3, y, true);

  const byKey = new Map<string, Node>();
  for (const n of nodes) byKey.set(keyFor(n.h), n);
  const byName = new Map<string, Node>();
  for (const n of nodes) { const nm = (n.h.sysName || n.h.hostname || '').toLowerCase(); if (nm) byName.set(nm, n); }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  const addEdge = (a?: Node, b?: Node, source = 'inferred') => {
    if (!a || !b || a === b) return;
    const k = [keyFor(a.h), keyFor(b.h)].sort().join('|');
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ a, b, source });
  };

  for (const nb of neighbors) {
    const a = (nb.aMac && byKey.get(nb.aMac.toLowerCase())) || (nb.aName && byName.get(nb.aName.toLowerCase())) || undefined;
    const b = (nb.bMac && byKey.get(nb.bMac.toLowerCase())) || (nb.bName && byName.get(nb.bName.toLowerCase())) || undefined;
    addEdge(a, b, nb.source);
  }

  // Inferred backbone: connect infra tiers, and hang endpoints off the nearest
  // switch (or router) when we have no authoritative edge for them.
  const routers = nodes.filter((n) => roleOf(n.h) === 'router');
  const switches = nodes.filter((n) => roleOf(n.h) === 'switch');
  const aps = nodes.filter((n) => roleOf(n.h) === 'ap');
  const gateway = routers[0] || switches[0] || null;
  for (const sw of switches) addEdge(gateway || undefined, sw, 'inferred');
  for (const ap of aps) addEdge(switches[0] || gateway || undefined, ap, 'inferred');
  const hasEdge = (n: Node) => edges.some((e) => e.a === n || e.b === n);
  const anchor = switches[0] || gateway;
  if (anchor) for (const n of nodes) { if (ROLE[roleOf(n.h)].tier === 3 && !hasEdge(n)) addEdge(anchor, n, 'inferred'); }

  const xs = nodes.map((n) => n.x);
  const minX = Math.min(0, ...xs) - PAD;
  const maxX = Math.max(0, ...xs) + PAD;
  const width = maxX - minX;
  // shift so minX -> PAD
  for (const n of nodes) n.x -= minX;
  return { nodes, edges, width: width, height: y + PAD };
}

// ---- component ---------------------------------------------------------------
export const NetworkMapView: React.FC = () => {
  const [sites, setSites] = useState<NetSite[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [nodesData, setNodesData] = useState<{ nodes: NetHost[]; edges: NetNeighbor[]; collectorDeviceId: string | null }>({ nodes: [], edges: [], collectorDeviceId: null });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<NetHost | null>(null);
  const [tab, setTab] = useState<'map' | 'table'>('map');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string>('');

  const site = sites.find((s) => s.siteId === siteId) || null;

  const loadInventory = async () => {
    try {
      const r = await net.inventory();
      setSites(r.sites);
      if (!siteId && r.sites.length) setSiteId(r.sites[0].siteId);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  const loadTopology = async (id: string) => {
    if (!id) return;
    try { const t = await net.topology(id); setNodesData(t); } catch { /* ignore */ }
  };

  useEffect(() => { loadInventory(); }, []);
  useEffect(() => { if (siteId) loadTopology(siteId); }, [siteId]);
  useEffect(() => {
    const t = setInterval(() => { loadInventory(); if (siteId) loadTopology(siteId); }, 30000);
    return () => clearInterval(t);
  }, [siteId]);

  const hosts = nodesData.nodes;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hosts.filter((h) => {
      if (roleFilter !== 'all' && roleOf(h) !== roleFilter) return false;
      if (!q) return true;
      return [nameOf(h), h.vendor, h.model, ...(h.ips || []), h.mac].filter(Boolean).some((s) => (s as string).toLowerCase().includes(q));
    });
  }, [hosts, query, roleFilter]);

  const graph = useMemo(() => layout(hosts, nodesData.edges), [hosts, nodesData.edges]);

  const scanNow = async () => {
    if (!siteId) return;
    setScanning(true);
    try { await net.scanNow(siteId); setToast('Scan requested — the site collector runs it on its next check-in.'); }
    catch { setToast('Could not request a scan.'); }
    finally { setScanning(false); setTimeout(() => setToast(''), 6000); }
  };

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of hosts) { const r = roleOf(h); c[r] = (c[r] || 0) + 1; }
    return c;
  }, [hosts]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f4f6f8]">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center"><Radar className="w-4 h-4 text-indigo-600" /></div>
          <div>
            <div className="text-base font-bold text-slate-800 leading-tight">Network Map</div>
            <div className="text-[11px] text-slate-400 leading-tight">Discovery &amp; topology · agent-based collector</div>
          </div>
        </div>

        {sites.length > 0 && (
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setSelected(null); }}
            className="text-sm font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 cursor-pointer outline-none focus:border-indigo-500">
            {sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.siteId === '_default' ? 'Default site' : s.siteId} · {s.hostCount} devices</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden sm:flex items-center rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setTab('map')} className={`px-3 py-1.5 text-xs font-semibold ${tab === 'map' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Map</button>
            <button onClick={() => setTab('table')} className={`px-3 py-1.5 text-xs font-semibold ${tab === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Table</button>
          </div>
          <button onClick={() => setShowSettings(true)} title="Discovery settings (SNMP, cadence)"
            className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-semibold">
            <SlidersHorizontal className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Settings</span>
          </button>
          <button onClick={scanNow} disabled={scanning || !siteId}
            className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50">
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Scan now
          </button>
        </div>
      </div>

      {/* Stat strip */}
      {hosts.length > 0 && (
        <div className="shrink-0 px-4 sm:px-6 py-2 bg-white border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span><b className="text-slate-700 tabular-nums">{hosts.length}</b> devices</span>
          <span><b className="text-emerald-600 tabular-nums">{hosts.filter((h) => h.online).length}</b> online</span>
          {(['router', 'switch', 'ap', 'printer', 'camera', 'nas', 'workstation'] as const).map((r) =>
            roleCounts[r] ? <span key={r}>{ROLE[r].label}: <b className="text-slate-700 tabular-nums">{roleCounts[r]}</b></span> : null)}
          {site && <span className="ml-auto">Prefixes: <b className="text-slate-700">{site.prefixes.join(', ') || '—'}</b> · updated {timeAgo(site.updatedAt)}</span>}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          {loading ? (
            <Centered><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></Centered>
          ) : hosts.length === 0 ? (
            <EmptyState collector={nodesData.collectorDeviceId} onScan={scanNow} scanning={scanning} />
          ) : tab === 'map' ? (
            <TopologyCanvas graph={graph} selected={selected} onSelect={setSelected} />
          ) : (
            <DeviceTable hosts={filtered} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onSelect={setSelected} counts={roleCounts} />
          )}
        </div>

        {selected && <DetailDrawer host={selected} onClose={() => setSelected(null)} onToast={(m) => { setToast(m); setTimeout(() => setToast(''), 6000); }} />}
      </div>

      {showSettings && siteId && <SettingsModal siteId={siteId} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); loadTopology(siteId); }} />}
      {toast && <div className="fixed bottom-5 right-5 z-[120] max-w-sm px-4 py-3 rounded-xl shadow-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-sm font-semibold">{toast}</div>}
    </div>
  );
};

// ---- topology canvas ---------------------------------------------------------
const TopologyCanvas: React.FC<{ graph: ReturnType<typeof layout>; selected: NetHost | null; onSelect: (h: NetHost) => void }> = ({ graph, selected, onSelect }) => {
  const { nodes, edges, width, height } = graph;
  const [vb, setVb] = useState({ x: 0, y: 0, w: Math.max(width, 800), h: Math.max(height, 600) });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  useEffect(() => { setVb({ x: 0, y: 0, w: Math.max(width, 800), h: Math.max(height, 600) }); }, [width, height]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setVb((v) => {
      const nw = Math.min(Math.max(v.w * factor, 300), 8000);
      const nh = nw * (v.h / v.w);
      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      return { x: v.x + (v.w - nw) * px, y: v.y + (v.h - nh) * py, w: nw, h: nh };
    });
  };
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const sx = vb.w / rect.width, sy = vb.h / rect.height;
    setVb((v) => ({ ...v, x: drag.current!.vx - (e.clientX - drag.current!.x) * sx, y: drag.current!.vy - (e.clientY - drag.current!.y) * sy }));
  };
  const onUp = () => { drag.current = null; };

  return (
    <svg className="w-full h-full bg-[#0b0e14] touch-none cursor-grab active:cursor-grabbing"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#1b2130" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#grid)" />
      {/* edges */}
      {edges.map((e, i) => (
        <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
          stroke={e.source === 'inferred' ? '#334155' : '#3b82f6'}
          strokeWidth={e.source === 'inferred' ? 1.2 : 2}
          strokeDasharray={e.source === 'inferred' ? '5 5' : undefined} opacity={0.8} />
      ))}
      {/* nodes */}
      {nodes.map((n, i) => {
        const r = ROLE[roleOf(n.h)];
        const isSel = selected && keyFor(selected) === keyFor(n.h);
        return (
          <g key={i} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); onSelect(n.h); }}>
            <circle r={26} fill="#111826" stroke={isSel ? '#fff' : r.color} strokeWidth={isSel ? 3 : 2} />
            {!n.h.online && <circle r={26} fill="#000" opacity={0.45} />}
            <NodeGlyph role={roleOf(n.h)} color={r.color} />
            <circle cx={18} cy={-18} r={5} fill={n.h.online ? '#10b981' : '#64748b'} stroke="#111826" strokeWidth={2} />
            <text y={44} textAnchor="middle" fontSize={12} fill="#cbd5e1" fontWeight={600}>{truncate(nameOf(n.h), 18)}</text>
            <text y={59} textAnchor="middle" fontSize={10} fill="#64748b">{n.h.vendor || r.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

// SVG glyph per role (foreignObject keeps the lucide icon crisp).
const NodeGlyph: React.FC<{ role: Role; color: string }> = ({ role, color }) => {
  const Icon = ROLE[role].Icon;
  return (
    <foreignObject x={-12} y={-12} width={24} height={24}>
      <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        <Icon className="w-5 h-5" />
      </div>
    </foreignObject>
  );
};

// ---- device table ------------------------------------------------------------
const DeviceTable: React.FC<{
  hosts: NetHost[]; query: string; setQuery: (s: string) => void; roleFilter: string; setRoleFilter: (s: string) => void;
  onSelect: (h: NetHost) => void; counts: Record<string, number>;
}> = ({ hosts, query, setQuery, roleFilter, setRoleFilter, onSelect, counts }) => (
  <div className="h-full flex flex-col bg-white">
    <div className="shrink-0 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
      <div className="relative flex-1 max-w-xs">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, IP, MAC, vendor…"
          className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 outline-none focus:border-indigo-500" />
      </div>
      <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:border-indigo-500">
        <option value="all">All roles</option>
        {Object.keys(ROLE).map((r) => counts[r] ? <option key={r} value={r}>{ROLE[r].label} ({counts[r]})</option> : null)}
      </select>
    </div>
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
          <tr>
            <th className="text-left px-4 py-2">Device</th>
            <th className="text-left px-3 py-2">Role</th>
            <th className="text-left px-3 py-2">IP</th>
            <th className="text-left px-3 py-2 hidden md:table-cell">MAC</th>
            <th className="text-left px-3 py-2 hidden lg:table-cell">Vendor</th>
            <th className="text-left px-3 py-2 hidden lg:table-cell">Ports</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((h, i) => {
            const r = ROLE[roleOf(h)];
            return (
              <tr key={i} onClick={() => onSelect(h)} className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                <td className="px-4 py-2 font-semibold text-slate-700 flex items-center gap-2">
                  <r.Icon className="w-4 h-4 shrink-0" style={{ color: r.color }} /> {truncate(nameOf(h), 28)}
                  {h.managedDeviceId && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">MANAGED</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.label}</td>
                <td className="px-3 py-2 text-slate-600 tabular-nums">{h.ips?.[0] || '—'}</td>
                <td className="px-3 py-2 text-slate-400 font-mono text-xs hidden md:table-cell">{h.mac || '—'}</td>
                <td className="px-3 py-2 text-slate-500 hidden lg:table-cell">{h.vendor || '—'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs hidden lg:table-cell">{(h.openPorts || []).slice(0, 6).join(', ') || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${h.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{h.online ? 'online' : 'offline'}</span>
                </td>
              </tr>
            );
          })}
          {hosts.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No devices match.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
);

// ---- detail drawer -----------------------------------------------------------
const DetailDrawer: React.FC<{ host: NetHost; onClose: () => void; onToast: (m: string) => void }> = ({ host, onClose, onToast }) => {
  const r = ROLE[roleOf(host)];
  const wp = webPort(host);
  const [busy, setBusy] = useState<string>('');

  const openWeb = async () => {
    if (!wp || !host.ips?.[0]) return;
    setBusy('web');
    try {
      const s = await net.openWebUI({ ip: host.ips[0], port: wp });
      if (s.url) window.open(s.url, '_blank', 'noopener');
      else onToast('Tunnel not available yet — the site collector must be online.');
    } catch { onToast('Could not open a tunnel to this device.'); }
    finally { setBusy(''); }
  };
  const openSsh = async () => {
    if (!host.ips?.[0]) return;
    setBusy('ssh');
    try {
      const s = await net.openSSH({ ip: host.ips[0] });
      if (s.url) window.open(s.url, '_blank', 'noopener');
      else onToast('SSH tunnel not available yet — the site collector must be online.');
    } catch { onToast('Could not open an SSH tunnel to this device.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <r.Icon className="w-5 h-5 shrink-0" style={{ color: r.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-800 truncate">{nameOf(host)}</div>
          <div className="text-[11px] text-slate-400">{r.label}{host.vendor ? ` · ${host.vendor}` : ''}</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3 text-sm">
        {/* actions */}
        <div className="flex gap-2">
          {wp && (
            <button onClick={openWeb} disabled={busy === 'web'} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2 py-2 disabled:opacity-50">
              {busy === 'web' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />} Web UI
            </button>
          )}
          {hasSsh(host) && (
            <button onClick={openSsh} disabled={busy === 'ssh'} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-800 text-white rounded-lg px-2 py-2 disabled:opacity-50">
              {busy === 'ssh' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TerminalSquare className="w-3.5 h-3.5" />} SSH
            </button>
          )}
          {host.managedDeviceId && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-lg px-2"><MonitorSmartphone className="w-3.5 h-3.5" /> Managed</span>
          )}
        </div>

        <Fact label="Status" value={host.online ? 'Online' : 'Offline'} />
        <Fact label="IP addresses" value={(host.ips || []).join(', ') || '—'} />
        <Fact label="MAC" value={host.mac || '—'} mono />
        {host.vendor && <Fact label="Vendor" value={host.vendor} />}
        {host.model && <Fact label="Model" value={host.model} />}
        {host.sysName && <Fact label="SNMP sysName" value={host.sysName} />}
        {host.sysDescr && <Fact label="SNMP sysDescr" value={host.sysDescr} />}
        {typeof host.uptimeSec === 'number' && host.uptimeSec > 0 && <Fact label="Uptime" value={humanUptime(host.uptimeSec)} />}
        {host.latencyMs ? <Fact label="Latency" value={`${host.latencyMs} ms`} /> : null}
        {host.openPorts && host.openPorts.length > 0 && <Fact label="Open ports" value={host.openPorts.join(', ')} />}
        {host.services && host.services.length > 0 && <Fact label="Services" value={host.services.join(', ')} />}
        {host.source && <Fact label="Seen via" value={host.source} />}
        <Fact label="Last seen" value={timeAgo(host.lastSeen)} />

        {host.ifaces && host.ifaces.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Interfaces (SNMP)</div>
            <div className="flex flex-col gap-1">
              {host.ifaces.slice(0, 24).map((f) => (
                <div key={f.index} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${f.operUp ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="text-slate-600 truncate flex-1">{f.name || `if${f.index}`}</span>
                  {f.speedMb ? <span className="text-slate-400 tabular-nums">{f.speedMb >= 1000 ? `${f.speedMb / 1000}G` : `${f.speedMb}M`}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---- settings modal ----------------------------------------------------------
const SettingsModal: React.FC<{ siteId: string; onClose: () => void; onSaved: () => void }> = ({ siteId, onClose, onSaved }) => {
  const [cfg, setCfg] = useState<NetConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [fullMin, setFullMin] = useState(30);
  const [liveMin, setLiveMin] = useState(5);
  const [prefixes, setPrefixes] = useState('');
  const [community, setCommunity] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    net.getConfig(siteId).then((c) => {
      setCfg(c); setEnabled(c.enabled); setFullMin(c.fullIntervalMin); setLiveMin(c.liveIntervalMin);
      setPrefixes((c.prefixes || []).join(', '));
    }).catch(() => {});
  }, [siteId]);

  const save = async () => {
    setBusy(true);
    try {
      const patch: any = {
        siteId, enabled, fullIntervalMin: fullMin, liveIntervalMin: liveMin,
        prefixes: prefixes.split(',').map((s) => s.trim()).filter(Boolean)
      };
      // Only replace SNMP creds if the operator typed a new community string.
      if (community.trim()) patch.snmp = [{ version: '2c', community: community.trim() }];
      await net.setConfig(patch);
      onSaved();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center"><Server className="w-4 h-4 text-indigo-600" /></div>
          <div className="text-base font-bold text-slate-800">Discovery settings</div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm text-slate-700">Discovery enabled for this site</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Full scan (min)</span>
            <input type="number" min={5} value={fullMin} onChange={(e) => setFullMin(parseInt(e.target.value, 10) || 30)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Liveness (min)</span>
            <input type="number" min={1} value={liveMin} onChange={(e) => setLiveMin(parseInt(e.target.value, 10) || 5)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Subnets (CIDR, comma-separated)</span>
          <input value={prefixes} onChange={(e) => setPrefixes(e.target.value)} placeholder="auto-detect if blank — e.g. 192.168.1.0/24"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">SNMP v2c community</span>
          <input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder={cfg && cfg.snmp.length ? '•••••• (set — type to replace)' : 'e.g. public (for switches/printers)'}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
          <span className="text-[10px] text-slate-400">Enables switch/printer detail and LLDP/CDP topology edges. Stored server-side only.</span>
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={busy} className="text-sm font-semibold text-white px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- small pieces ------------------------------------------------------------
const Fact: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
    <div className={`text-sm text-slate-700 break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
  </div>
);
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="absolute inset-0 flex items-center justify-center">{children}</div>
);
const EmptyState: React.FC<{ collector: string | null; onScan: () => void; scanning: boolean }> = ({ collector, onScan, scanning }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center"><Radar className="w-7 h-7 text-indigo-400" /></div>
    <div className="text-lg font-bold text-slate-700">No devices discovered yet</div>
    <div className="text-sm text-slate-400 max-w-md">
      {collector
        ? 'A site collector is online. Run a scan, or wait for the next scheduled sweep to map this network.'
        : 'Deploy the ApexMSP agent on a machine at this site — the control plane elects one as the collector and it maps the LAN automatically.'}
    </div>
    <button onClick={onScan} disabled={scanning} className="mt-1 h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50">
      {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Scan now
    </button>
  </div>
);

// ---- utils -------------------------------------------------------------------
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function timeAgo(iso: string) {
  if (!iso) return '—';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}
function humanUptime(sec: number) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}
