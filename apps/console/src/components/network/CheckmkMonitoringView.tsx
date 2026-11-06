import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Server, ShieldCheck, AlertTriangle, XCircle, CheckCircle2,
  RefreshCw, Radar, Plus, Play, Clock, Check, EyeOff, Eye, Sliders,
  Globe, Lock, Network, Search, Trash2, CalendarClock, BellOff,
  ChevronDown, ChevronRight, BarChart3, Layers, Cpu, HardDrive, Wifi, Terminal
} from 'lucide-react';
import { monitoring, type CheckmkOverviewResponse } from '../../services/api';
import { useApp } from '../../data/AppContext';
import type {
  CheckmkMonitoredHost,
  CheckmkServiceCheck,
  CheckmkActiveCheckConfig,
  CheckmkThresholdRule,
  CheckmkDowntime,
  CheckmkServiceState,
  CheckmkHostState,
  CheckmkCheckPlugin,
  CheckmkActiveCheckType
} from '@openmsp/api-types';

export type CheckmkTabKey =
  | 'cmk-overview'
  | 'cmk-hosts'
  | 'cmk-discovery'
  | 'cmk-active-checks'
  | 'cmk-rules'
  | 'cmk-topology';

interface Props {
  activeSubTab: CheckmkTabKey;
  onChangeSubTab: (tab: CheckmkTabKey) => void;
  renderTopologyMap: () => React.ReactNode;
}

const HOST_STATE_STYLE: Record<CheckmkHostState, { bg: string; text: string; border: string }> = {
  UP:      { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600' },
  DOWN:    { bg: 'bg-rose-600',    text: 'text-white', border: 'border-rose-700' },
  UNREACH: { bg: 'bg-orange-500',  text: 'text-white', border: 'border-orange-600' },
  PENDING: { bg: 'bg-slate-400',   text: 'text-white', border: 'border-slate-500' }
};

const SVC_STATE_STYLE: Record<CheckmkServiceState, { bg: string; text: string; softBg: string; softText: string }> = {
  OK:      { bg: 'bg-emerald-500', text: 'text-white', softBg: 'bg-emerald-50', softText: 'text-emerald-700' },
  WARN:    { bg: 'bg-amber-400',   text: 'text-slate-950', softBg: 'bg-amber-50', softText: 'text-amber-800' },
  CRIT:    { bg: 'bg-rose-600',    text: 'text-white', softBg: 'bg-rose-50', softText: 'text-rose-700' },
  UNKNOWN: { bg: 'bg-orange-500',  text: 'text-white', softBg: 'bg-orange-50', softText: 'text-orange-800' },
  PENDING: { bg: 'bg-slate-400',   text: 'text-white', softBg: 'bg-slate-100', softText: 'text-slate-600' }
};

const PLUGIN_LABELS: Record<CheckmkCheckPlugin, string> = {
  cpu_utilization: 'CPU Utilization',
  memory_usage: 'Memory & Pagefile',
  filesystem_usage: 'Filesystem Space',
  system_uptime: 'System Uptime',
  patch_compliance: 'Patch Compliance',
  security_edr_posture: 'EDR / AV Posture',
  backup_status: 'ApexVault Backup',
  windows_service: 'OS Service',
  smb_share: 'SMB File Share',
  network_interface: 'SNMP Interface',
  snmp_uptime: 'SNMP System Info',
  icmp_ping: 'PING / ICMP',
  tcp_port: 'TCP Socket Check',
  http_tls: 'HTTP & SSL/TLS',
  dns_lookup: 'DNS Resolution'
};

// Checkmk-style inline Perf-O-Meter bar
const PerfOMeter: React.FC<{ svc: CheckmkServiceCheck }> = ({ svc }) => {
  const p = svc.perfData?.[0];
  if (!p) return <span className="text-[11px] text-slate-400">—</span>;

  let pct = 0;
  if (p.unit === '%') {
    pct = Math.max(0, Math.min(100, p.value));
  } else if (p.crit && p.crit > 0) {
    pct = Math.max(2, Math.min(100, (p.value / (p.crit * 1.25)) * 100));
  } else {
    pct = Math.min(100, Math.max(8, p.value));
  }

  const barColor =
    svc.state === 'CRIT'
      ? 'bg-rose-500'
      : svc.state === 'WARN'
      ? 'bg-amber-400'
      : svc.state === 'UNKNOWN'
      ? 'bg-orange-400'
      : 'bg-emerald-500';

  return (
    <div className="w-32">
      <div className="h-4 bg-slate-100 border border-slate-200 rounded overflow-hidden relative flex items-center">
        <div
          className={`h-full ${barColor} opacity-80 transition-all`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-800 tabular-nums drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
          {p.value} {p.unit}
        </span>
      </div>
    </div>
  );
};

// Mini SVG Sparkline for service rows
const MiniSparkline: React.FC<{ svc: CheckmkServiceCheck; onClick: () => void }> = ({ svc, onClick }) => {
  const pts = svc.metricsHistory || [];
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, pts[0]?.crit || 100, 1);
  const w = 78;
  const h = 22;
  const coords = pts.map((p, i) => {
    const x = (i / Math.max(1, pts.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((p.value - min) / Math.max(1, max - min)) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const stroke =
    svc.state === 'CRIT'
      ? '#e11d48'
      : svc.state === 'WARN'
      ? '#d97706'
      : '#10b981';

  return (
    <button
      onClick={onClick}
      title="Open Checkmk RRD Time-Series Performance Graph"
      className="p-0.5 rounded hover:bg-slate-100 border border-transparent hover:border-slate-200 transition cursor-pointer"
    >
      <svg width={w} height={h} className="overflow-visible">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          points={coords.join(' ')}
        />
      </svg>
    </button>
  );
};

export const CheckmkMonitoringView: React.FC<Props> = ({
  activeSubTab,
  onChangeSubTab,
  renderTopologyMap
}) => {
  const { clients } = useApp();
  const [data, setData] = useState<CheckmkOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);

  // Filters
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [hostFilter, setHostFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<'ALL' | CheckmkServiceState>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({});

  // Modals
  const [graphService, setGraphService] = useState<CheckmkServiceCheck | null>(null);
  const [ackModal, setAckModal] = useState<{ targetType: 'host' | 'service'; id: string; label: string } | null>(null);
  const [ackComment, setAckComment] = useState('Investigating issue — acknowledged by operator');
  const [ackSticky, setAckSticky] = useState(true);

  const [downtimeModal, setDowntimeModal] = useState<{ hostId: string; hostName: string; serviceId?: string; serviceName?: string } | null>(null);
  const [dtDurationMin, setDtDurationMin] = useState(120);
  const [dtComment, setDtComment] = useState('Scheduled Maintenance / Server Cutover Window');

  const [showNewActiveCheck, setShowNewActiveCheck] = useState(false);
  const [newCheckForm, setNewCheckForm] = useState<{
    name: string;
    type: CheckmkActiveCheckType;
    target: string;
    port: number;
    expectedStatus: number;
    expectedBodySubstring: string;
    dnsRecordType: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
    expectedDnsAnswer: string;
    warnMs: number;
    critMs: number;
    certWarnDays: number;
    certCritDays: number;
    intervalSec: number;
    hostId: string;
    clientId: string;
    autoCreateTicket: boolean;
  }>({
    name: '',
    type: 'http_tls',
    target: 'https://',
    port: 445,
    expectedStatus: 200,
    expectedBodySubstring: '',
    dnsRecordType: 'A',
    expectedDnsAnswer: '',
    warnMs: 500,
    critMs: 2000,
    certWarnDays: 30,
    certCritDays: 14,
    intervalSec: 60,
    hostId: '',
    clientId: '',
    autoCreateTicket: true
  });

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState<{
    id?: string;
    name: string;
    description: string;
    plugin: CheckmkCheckPlugin;
    hostId: string;
    servicePattern: string;
    warnThreshold: number;
    critThreshold: number;
    maxAttempts: number;
    checkIntervalSec: number;
    autoCreateTicket: boolean;
  }>({
    name: '',
    description: '',
    plugin: 'filesystem_usage',
    hostId: '',
    servicePattern: '',
    warnThreshold: 80,
    critThreshold: 90,
    maxAttempts: 3,
    checkIntervalSec: 60,
    autoCreateTicket: true
  });

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await monitoring.getOverview(clientFilter);
      setData(res);
      // Expand all hosts by default on first load
      setExpandedHosts((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const next: Record<string, boolean> = {};
        for (const h of res.hosts) next[h.id] = true;
        return next;
      });
    } catch (err) {
      console.error('[Checkmk] Failed to load overview:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(true), 15_000);
    return () => clearInterval(timer);
  }, [clientFilter]);

  const handleRunDiscovery = async (targetHostId?: string) => {
    setDiscovering(true);
    try {
      await monitoring.discover(targetHostId, true);
      await loadData(true);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSetDiscoveryState = async (
    serviceIds: string[] | undefined,
    targetHostId: string | undefined,
    discoveryState: 'monitored' | 'undecided' | 'ignored'
  ) => {
    await monitoring.updateDiscoveryState({ serviceIds, hostId: targetHostId, discoveryState });
    await loadData(true);
  };

  const handleSubmitAck = async () => {
    if (!ackModal) return;
    await monitoring.acknowledge({
      targetType: ackModal.targetType,
      id: ackModal.id,
      comment: ackComment,
      sticky: ackSticky
    });
    setAckModal(null);
    await loadData(true);
  };

  const handleClearAck = async (targetType: 'host' | 'service', id: string) => {
    await monitoring.acknowledge({ targetType, id, clear: true });
    await loadData(true);
  };

  const handleSubmitDowntime = async () => {
    if (!downtimeModal) return;
    await monitoring.createDowntime({
      hostId: downtimeModal.hostId,
      serviceId: downtimeModal.serviceId,
      durationMinutes: dtDurationMin,
      comment: dtComment
    });
    setDowntimeModal(null);
    await loadData(true);
  };

  const handleDeleteDowntime = async (id: string) => {
    await monitoring.deleteDowntime(id);
    await loadData(true);
  };

  const handleCreateActiveCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCheckForm.name.trim() || !newCheckForm.target.trim()) return;
    setDiscovering(true);
    try {
      await monitoring.saveActiveCheck(newCheckForm);
      setShowNewActiveCheck(false);
      await loadData(true);
    } finally {
      setDiscovering(false);
    }
  };

  const handleRunActiveCheckNow = async (id: string) => {
    setRunningCheckId(id);
    try {
      await monitoring.runActiveCheck(id);
      await loadData(true);
    } finally {
      setRunningCheckId(null);
    }
  };

  const handleDeleteActiveCheck = async (id: string) => {
    await monitoring.deleteActiveCheck(id);
    await loadData(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name.trim()) return;
    await monitoring.saveRule(ruleForm);
    setShowRuleModal(false);
    await loadData(true);
  };

  const handleDeleteRule = async (id: string) => {
    await monitoring.deleteRule(id);
    await loadData(true);
  };

  const hosts = data?.hosts || [];
  const services = data?.services || [];
  const overview = data?.overview;
  const activeChecks = data?.activeChecks || [];
  const rules = data?.rules || [];
  const downtimes = data?.downtimes || [];

  // Filtered monitored services for Hosts & Services table
  const monitoredServices = useMemo(() => {
    return services.filter((s) => {
      if (s.discoveryState !== 'monitored') return false;
      if (hostFilter !== 'all' && s.hostId !== hostFilter) return false;
      if (stateFilter !== 'ALL' && s.state !== stateFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          s.serviceName.toLowerCase().includes(q) ||
          s.hostName.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.plugin.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [services, hostFilter, stateFilter, searchQuery]);

  // Unhandled problems (WARN, CRIT, UNKNOWN services + DOWN hosts not acked and not in downtime)
  const unhandledProblems = useMemo(() => {
    return services.filter(
      (s) =>
        s.discoveryState === 'monitored' &&
        s.state !== 'OK' &&
        s.state !== 'PENDING' &&
        !s.acknowledged &&
        !s.inDowntime
    );
  }, [services]);

  const undecidedServices = useMemo(
    () => services.filter((s) => s.discoveryState === 'undecided' && (hostFilter === 'all' || s.hostId === hostFilter)),
    [services, hostFilter]
  );

  const ignoredServices = useMemo(
    () => services.filter((s) => s.discoveryState === 'ignored' && (hostFilter === 'all' || s.hostId === hostFilter)),
    [services, hostFilter]
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#f4f6f8] overflow-hidden">
      {/* ===================================================================== */}
      {/* TOP BAR: Checkmk Header + Tactical Summary Strip + View Switcher      */}
      {/* ===================================================================== */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm font-black text-sm">
            cmk
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900">
                ApexCheck — Checkmk Infrastructure & Service Monitoring
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Checkmk 2.3 Engine Live
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Auto-discovery (WATO), stateful host/service checks (SOFT/HARD attempts), parent UNREACH correlation, active HTTP/TLS/TCP/DNS probes & RRD graphs
            </p>
          </div>
        </div>

        {/* Right Controls: Client Filter + Service Discovery Button */}
        <div className="flex items-center gap-2">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="all">All Clients ({hosts.length} hosts)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={() => void handleRunDiscovery(hostFilter !== 'all' ? hostFilter : undefined)}
            disabled={discovering}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-60"
          >
            <Radar className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
            <span>{discovering ? 'Running Discovery...' : 'Run Service Discovery'}</span>
          </button>

          <button
            onClick={() => void loadData()}
            className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Refresh Checkmk States"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-5 flex items-center gap-1 overflow-x-auto shrink-0">
        {[
          { key: 'cmk-overview' as CheckmkTabKey, label: 'Tactical Overview', Icon: Activity, badge: overview?.services.unhandledProblems ? `${overview.services.unhandledProblems}` : undefined, badgeColor: 'bg-rose-600 text-white' },
          { key: 'cmk-hosts' as CheckmkTabKey, label: 'Hosts & Services', Icon: Server, badge: `${overview?.services.total || 0}` },
          { key: 'cmk-discovery' as CheckmkTabKey, label: 'Service Discovery (WATO)', Icon: Radar, badge: undecidedServices.length > 0 ? `${undecidedServices.length} New` : undefined, badgeColor: 'bg-indigo-600 text-white' },
          { key: 'cmk-active-checks' as CheckmkTabKey, label: 'Active Checks (HTTP/TLS/TCP/DNS)', Icon: Globe, badge: `${activeChecks.length}` },
          { key: 'cmk-rules' as CheckmkTabKey, label: 'Threshold Rules & Downtimes', Icon: Sliders, badge: downtimes.length > 0 ? `${downtimes.length} Maint` : undefined, badgeColor: 'bg-sky-600 text-white' },
          { key: 'cmk-topology' as CheckmkTabKey, label: 'Network Topology Map', Icon: Network }
        ].map((tab) => {
          const active = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChangeSubTab(tab.key)}
              className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                active
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <tab.Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${tab.badgeColor || 'bg-slate-100 text-slate-700'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 6: NETWORK TOPOLOGY MAP (Full Canvas)                             */}
      {/* ===================================================================== */}
      {activeSubTab === 'cmk-topology' && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {renderTopologyMap()}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TABS 1–5: CHECKMK WORKBENCH CONTENT                                   */}
      {/* ===================================================================== */}
      {activeSubTab !== 'cmk-topology' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Checkmk Tactical Overview Strip (Always visible at top of Checkmk tabs) */}
          {overview && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* HOST STATES MATRIX */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Host States ({overview.hosts.total} Monitored)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {overview.hosts.inDowntime > 0 && (
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold border border-sky-200">
                        {overview.hosts.inDowntime} in Downtime
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded font-bold ${overview.hosts.unhandledProblems > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {overview.hosts.unhandledProblems} Unhandled
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  <div className="rounded-lg bg-emerald-500 text-white p-3 flex flex-col justify-between shadow-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">UP</span>
                    <span className="text-2xl font-black tabular-nums">{overview.hosts.up}</span>
                  </div>
                  <div className={`rounded-lg p-3 flex flex-col justify-between shadow-xs ${overview.hosts.down > 0 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider">DOWN</span>
                    <span className="text-2xl font-black tabular-nums">{overview.hosts.down}</span>
                  </div>
                  <div className={`rounded-lg p-3 flex flex-col justify-between shadow-xs ${overview.hosts.unreach > 0 ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider">UNREACH</span>
                    <span className="text-2xl font-black tabular-nums">{overview.hosts.unreach}</span>
                  </div>
                  <div className="rounded-lg bg-slate-100 text-slate-600 p-3 flex flex-col justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider">PENDING</span>
                    <span className="text-2xl font-black tabular-nums">{overview.hosts.pending}</span>
                  </div>
                </div>
              </div>

              {/* SERVICE STATES MATRIX */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Service States ({overview.services.total} Active Checks)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {overview.services.undecidedDiscovery > 0 && (
                      <button
                        onClick={() => onChangeSubTab('cmk-discovery')}
                        className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                      >
                        {overview.services.undecidedDiscovery} Undecided in WATO
                      </button>
                    )}
                    <span className={`px-2 py-0.5 rounded font-bold ${overview.services.unhandledProblems > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {overview.services.unhandledProblems} Unhandled
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  <button
                    onClick={() => { setStateFilter('OK'); onChangeSubTab('cmk-hosts'); }}
                    className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white p-3 flex flex-col justify-between text-left shadow-xs transition cursor-pointer"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">OK</span>
                    <span className="text-2xl font-black tabular-nums">{overview.services.ok}</span>
                  </button>
                  <button
                    onClick={() => { setStateFilter('WARN'); onChangeSubTab('cmk-hosts'); }}
                    className={`rounded-lg p-3 flex flex-col justify-between text-left shadow-xs transition cursor-pointer ${overview.services.warn > 0 ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">WARN</span>
                    <span className="text-2xl font-black tabular-nums">{overview.services.warn}</span>
                  </button>
                  <button
                    onClick={() => { setStateFilter('CRIT'); onChangeSubTab('cmk-hosts'); }}
                    className={`rounded-lg p-3 flex flex-col justify-between text-left shadow-xs transition cursor-pointer ${overview.services.crit > 0 ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">CRIT</span>
                    <span className="text-2xl font-black tabular-nums">{overview.services.crit}</span>
                  </button>
                  <button
                    onClick={() => { setStateFilter('UNKNOWN'); onChangeSubTab('cmk-hosts'); }}
                    className={`rounded-lg p-3 flex flex-col justify-between text-left shadow-xs transition cursor-pointer ${overview.services.unknown > 0 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">UNKNOWN</span>
                    <span className="text-2xl font-black tabular-nums">{overview.services.unknown}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 1: TACTICAL OVERVIEW & FLEET HOST HEALTH                      */}
          {/* ================================================================= */}
          {activeSubTab === 'cmk-overview' && (
            <>
              {/* Unhandled Problems Panel */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${unhandledProblems.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
                    <span className="text-xs font-bold text-slate-800">
                      Unhandled Service Problems ({unhandledProblems.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Acknowledge problems or schedule maintenance windows to suppress alerts
                  </span>
                </div>

                {unhandledProblems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                    <div className="font-semibold text-slate-800">Zero Unhandled Service Problems</div>
                    <div>All monitored services across {hosts.length} hosts are currently OK, acknowledged, or in scheduled downtime.</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                        <tr>
                          <th className="py-2 px-3 font-semibold">State</th>
                          <th className="py-2 px-3 font-semibold">Host</th>
                          <th className="py-2 px-3 font-semibold">Service</th>
                          <th className="py-2 px-3 font-semibold">Attempt</th>
                          <th className="py-2 px-3 font-semibold">Status Detail Output</th>
                          <th className="py-2 px-3 font-semibold">Perf-O-Meter</th>
                          <th className="py-2 px-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {unhandledProblems.map((svc) => {
                          const st = SVC_STATE_STYLE[svc.state];
                          return (
                            <tr key={svc.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${st.bg} ${st.text}`}>
                                  {svc.state}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{svc.hostName}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">{svc.serviceName}</td>
                              <td className="py-2.5 px-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${svc.stateType === 'HARD' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                  {svc.stateType} ({svc.attempt}/{svc.maxAttempts})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-md truncate" title={svc.summary}>
                                {svc.summary}
                              </td>
                              <td className="py-2.5 px-3">
                                <PerfOMeter svc={svc} />
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => setGraphService(svc)}
                                    className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                                  >
                                    Graph
                                  </button>
                                  <button
                                    onClick={() => setAckModal({ targetType: 'service', id: svc.id, label: `${svc.hostName} › ${svc.serviceName}` })}
                                    className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-semibold cursor-pointer"
                                  >
                                    Ack
                                  </button>
                                  <button
                                    onClick={() => setDowntimeModal({ hostId: svc.hostId, hostName: svc.hostName, serviceId: svc.id, serviceName: svc.serviceName })}
                                    className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold cursor-pointer"
                                  >
                                    Downtime
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Monitored Hosts Grid */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-800">
                      Monitored Hosts Summary ({hosts.length})
                    </span>
                  </div>
                  <button
                    onClick={() => onChangeSubTab('cmk-hosts')}
                    className="text-xs text-emerald-700 hover:text-emerald-600 font-semibold cursor-pointer"
                  >
                    Open Full Service Matrix →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">State</th>
                        <th className="py-2.5 px-3 font-semibold">Host Name</th>
                        <th className="py-2.5 px-3 font-semibold">IP Address</th>
                        <th className="py-2.5 px-3 font-semibold">Client / Site</th>
                        <th className="py-2.5 px-3 font-semibold">Checkmk Host Labels</th>
                        <th className="py-2.5 px-3 font-semibold">Services Summary</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {hosts.map((h) => {
                        const hs = HOST_STATE_STYLE[h.state];
                        return (
                          <tr key={h.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${hs.bg} ${hs.text}`}>
                                  {h.state}
                                </span>
                                {h.inDowntime && (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[9px] font-bold">
                                    DOWNTIME
                                  </span>
                                )}
                                {h.acknowledged && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold">
                                    ACK
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <button
                                onClick={() => { setHostFilter(h.id); onChangeSubTab('cmk-hosts'); }}
                                className="font-bold text-slate-900 hover:text-emerald-600 text-left cursor-pointer"
                              >
                                {h.name}
                              </button>
                              <div className="text-[10px] text-slate-400">{h.os}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {h.ipAddress || '—'}
                              {typeof h.latencyMs === 'number' && (
                                <span className="ml-1.5 text-[10px] text-slate-400">({h.latencyMs} ms)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              <div className="font-medium text-slate-800">{h.clientName}</div>
                              <div className="text-[10px] text-slate-400">{h.siteName}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(h.labels || {}).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-600"
                                  >
                                    {k.replace('cmk/', '')}:{v}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-emerald-500 text-white font-bold text-[10px] tabular-nums">
                                  {h.serviceCounts.ok} OK
                                </span>
                                {h.serviceCounts.warn > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold text-[10px] tabular-nums">
                                    {h.serviceCounts.warn} WARN
                                  </span>
                                )}
                                {h.serviceCounts.crit > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] tabular-nums">
                                    {h.serviceCounts.crit} CRIT
                                  </span>
                                )}
                                {h.serviceCounts.unknown > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-orange-500 text-white font-bold text-[10px] tabular-nums">
                                    {h.serviceCounts.unknown} UNKN
                                  </span>
                                )}
                                {h.serviceCounts.undecided > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[10px]">
                                    +{h.serviceCounts.undecided} new
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => { setHostFilter(h.id); onChangeSubTab('cmk-hosts'); }}
                                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium text-[11px] cursor-pointer"
                                >
                                  Services
                                </button>
                                <button
                                  onClick={() => { setHostFilter(h.id); onChangeSubTab('cmk-discovery'); }}
                                  className="px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] cursor-pointer"
                                >
                                  WATO Discovery
                                </button>
                                <button
                                  onClick={() => setDowntimeModal({ hostId: h.id, hostName: h.name })}
                                  className="px-2 py-1 rounded border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-[11px] cursor-pointer"
                                >
                                  Downtime
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* TAB 2: HOSTS & SERVICES MATRIX                                    */}
          {/* ================================================================= */}
          {activeSubTab === 'cmk-hosts' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter services, hosts, shares, ports..."
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md w-64 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <select
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 outline-none"
                  >
                    <option value="all">All Hosts ({hosts.length})</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.ipAddress || h.role})
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center rounded-md border border-slate-200 overflow-hidden text-xs">
                    {(['ALL', 'OK', 'WARN', 'CRIT', 'UNKNOWN'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStateFilter(st)}
                        className={`px-2.5 py-1 font-semibold transition cursor-pointer ${
                          stateFilter === st
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Showing <span className="font-bold text-slate-800">{monitoredServices.length}</span> monitored services
                </div>
              </div>

              {/* Host-Grouped Service Tables */}
              {hosts
                .filter((h) => hostFilter === 'all' || h.id === hostFilter)
                .map((host) => {
                  const hostServices = monitoredServices.filter((s) => s.hostId === host.id);
                  if (hostServices.length === 0) return null;
                  const isOpen = expandedHosts[host.id] !== false;
                  const hs = HOST_STATE_STYLE[host.state];

                  return (
                    <div key={host.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      {/* Host Group Header */}
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => setExpandedHosts((p) => ({ ...p, [host.id]: !isOpen }))}
                            className="p-1 rounded hover:bg-slate-200/60 text-slate-600 cursor-pointer"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${hs.bg} ${hs.text}`}>
                            {host.state}
                          </span>
                          <span className="font-bold text-xs text-slate-900">{host.name}</span>
                          <span className="text-xs font-mono text-slate-500">({host.ipAddress || host.hostname})</span>
                          <span className="text-[11px] text-slate-400">• {host.clientName}</span>
                          {host.inDowntime && (
                            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">
                              IN SCHEDULED DOWNTIME
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void handleRunDiscovery(host.id)}
                            className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Check Now</span>
                          </button>
                          <button
                            onClick={() => setDowntimeModal({ hostId: host.id, hostName: host.name })}
                            className="px-2.5 py-1 rounded border border-sky-200 bg-sky-50 hover:bg-sky-100 text-[11px] font-semibold text-sky-700 cursor-pointer"
                          >
                            Schedule Downtime
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50/50 text-slate-400 border-b border-slate-100 text-left">
                              <tr>
                                <th className="py-2 px-3 font-semibold w-20">State</th>
                                <th className="py-2 px-3 font-semibold w-56">Service Description</th>
                                <th className="py-2 px-3 font-semibold">Status Detail Output</th>
                                <th className="py-2 px-3 font-semibold w-24">State Type</th>
                                <th className="py-2 px-3 font-semibold w-36">Perf-O-Meter</th>
                                <th className="py-2 px-3 font-semibold w-24">Trend</th>
                                <th className="py-2 px-3 font-semibold w-44 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {hostServices.map((svc) => {
                                const st = SVC_STATE_STYLE[svc.state];
                                return (
                                  <tr key={svc.id} className="hover:bg-slate-50/70">
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${st.bg} ${st.text}`}>
                                          {svc.state}
                                        </span>
                                        {svc.inDowntime && (
                                          <span className="px-1 py-0.5 rounded bg-sky-100 text-sky-700 text-[9px] font-bold" title="Service in Scheduled Maintenance Window">
                                            DT
                                          </span>
                                        )}
                                        {svc.acknowledged && (
                                          <span className="px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-bold" title={`Acked by ${svc.acknowledged.by}: ${svc.acknowledged.comment}`}>
                                            ACK
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3">
                                      <div className="font-semibold text-slate-900">{svc.serviceName}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">{svc.plugin}</div>
                                    </td>
                                    <td className="py-2 px-3 text-slate-600">
                                      <div>{svc.summary}</div>
                                      {svc.acknowledged && (
                                        <div className="text-[10px] text-indigo-600 mt-0.5">
                                          ✓ Acknowledged by {svc.acknowledged.by}: "{svc.acknowledged.comment}"
                                          <button
                                            onClick={() => void handleClearAck('service', svc.id)}
                                            className="ml-2 underline hover:text-indigo-800 cursor-pointer"
                                          >
                                            Remove Ack
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2 px-3">
                                      <span className="text-[11px] font-mono text-slate-600">
                                        {svc.stateType} ({svc.attempt}/{svc.maxAttempts})
                                      </span>
                                    </td>
                                    <td className="py-2 px-3">
                                      <PerfOMeter svc={svc} />
                                    </td>
                                    <td className="py-2 px-3">
                                      <MiniSparkline svc={svc} onClick={() => setGraphService(svc)} />
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          onClick={() => setGraphService(svc)}
                                          className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700 cursor-pointer"
                                          title="Open Time-Series Performance Graph"
                                        >
                                          Graph
                                        </button>
                                        {svc.state !== 'OK' && !svc.acknowledged && (
                                          <button
                                            onClick={() => setAckModal({ targetType: 'service', id: svc.id, label: `${svc.hostName} › ${svc.serviceName}` })}
                                            className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-semibold cursor-pointer"
                                          >
                                            Ack
                                          </button>
                                        )}
                                        <button
                                          onClick={() => void handleSetDiscoveryState([svc.id], undefined, 'ignored')}
                                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                                          title="Disable / Ignore this service in WATO"
                                        >
                                          <EyeOff className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: WATO SERVICE DISCOVERY (`cmk -I`)                          */}
          {/* ================================================================= */}
          {activeSubTab === 'cmk-discovery' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    WATO Service Discovery Workbench (cmk --discover)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspect newly discovered services across endpoints and SNMP network devices, accept undecided checks into monitoring, or mute unwanted checks.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700"
                  >
                    <option value="all">All Hosts ({hosts.length})</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>{h.name} ({h.ipAddress})</option>
                    ))}
                  </select>

                  {undecidedServices.length > 0 && (
                    <button
                      onClick={() => void handleSetDiscoveryState(undecidedServices.map((s) => s.id), undefined, 'monitored')}
                      className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Monitor All {undecidedServices.length} Undecided Services</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Undecided / Newly Discovered Services */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-indigo-50/60 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950">
                    Undecided / Newly Discovered Services ({undecidedServices.length})
                  </span>
                  <span className="text-[11px] text-indigo-700">
                    Found on endpoints or SNMP interfaces but not yet added to active monitoring
                  </span>
                </div>
                {undecidedServices.length === 0 ? (
                  <div className="p-5 text-xs text-slate-500 text-center">
                    All discovered services are currently classified. Click "Run Service Discovery" to scan for new volumes, Windows services, or SNMP ports.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                      <tr>
                        <th className="py-2 px-3 font-semibold">State</th>
                        <th className="py-2 px-3 font-semibold">Host</th>
                        <th className="py-2 px-3 font-semibold">Check Plugin</th>
                        <th className="py-2 px-3 font-semibold">Service Description</th>
                        <th className="py-2 px-3 font-semibold">Current Check Output</th>
                        <th className="py-2 px-3 font-semibold text-right">WATO Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {undecidedServices.map((svc) => {
                        const st = SVC_STATE_STYLE[svc.state];
                        return (
                          <tr key={svc.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${st.bg} ${st.text}`}>
                                {svc.state}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{svc.hostName}</td>
                            <td className="py-2 px-3 font-mono text-slate-500">{svc.plugin}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{svc.serviceName}</td>
                            <td className="py-2 px-3 text-slate-600">{svc.summary}</td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => void handleSetDiscoveryState([svc.id], undefined, 'monitored')}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  Monitor
                                </button>
                                <button
                                  onClick={() => void handleSetDiscoveryState([svc.id], undefined, 'ignored')}
                                  className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] cursor-pointer"
                                >
                                  Ignore
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Disabled / Ignored Services */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Disabled / Ignored Services ({ignoredServices.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Muted services excluded from alerting and Tactical Overview counts
                  </span>
                </div>
                {ignoredServices.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400 text-center">
                    No ignored services.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {ignoredServices.map((svc) => (
                        <tr key={svc.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-700">{svc.hostName}</td>
                          <td className="py-2 px-3 font-medium text-slate-700">{svc.serviceName}</td>
                          <td className="py-2 px-3 text-slate-500">{svc.summary}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => void handleSetDiscoveryState([svc.id], undefined, 'monitored')}
                              className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Re-Enable Monitoring</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: ACTIVE CHECKS (HTTP/TLS, TCP, DNS, PING)                   */}
          {/* ================================================================= */}
          {activeSubTab === 'cmk-active-checks' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div>
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Active Network & Synthetic Checks (check_http, check_tls, check_tcp, check_dns, check_icmp)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time synthetic probes executed directly by the Control Plane to verify web endpoints, SSL certificate expiration days, TCP ports (SMB 445, SQL 1433, RDP 3389), and DNS records.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewActiveCheck(true)}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Active Check</span>
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">State</th>
                      <th className="py-2.5 px-3 font-semibold">Check Name</th>
                      <th className="py-2.5 px-3 font-semibold">Type</th>
                      <th className="py-2.5 px-3 font-semibold">Target / Endpoint</th>
                      <th className="py-2.5 px-3 font-semibold">Live Probe Output</th>
                      <th className="py-2.5 px-3 font-semibold">Thresholds</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeChecks.map((ac) => {
                      const linkedSvc = services.find((s) => s.activeCheckId === ac.id || s.serviceName === ac.name);
                      const state = linkedSvc?.state || 'PENDING';
                      const st = SVC_STATE_STYLE[state];
                      return (
                        <tr key={ac.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${st.bg} ${st.text}`}>
                              {state}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{ac.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] text-slate-700">
                              {ac.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {ac.target}{ac.port ? `:${ac.port}` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {linkedSvc?.summary || 'Pending initial execution...'}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-500">
                            WARN {ac.warnMs}ms / CRIT {ac.critMs}ms
                            {ac.type === 'http_tls' && ac.certWarnDays ? ` • SSL ${ac.certWarnDays}d/${ac.certCritDays}d` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {linkedSvc && (
                                <button
                                  onClick={() => setGraphService(linkedSvc)}
                                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700 cursor-pointer"
                                >
                                  Graph
                                </button>
                              )}
                              <button
                                onClick={() => void handleRunActiveCheckNow(ac.id)}
                                disabled={runningCheckId === ac.id}
                                className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Play className="w-3 h-3" />
                                <span>{runningCheckId === ac.id ? 'Probing...' : 'Run Now'}</span>
                              </button>
                              <button
                                onClick={() => void handleDeleteActiveCheck(ac.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete Active Check"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: WATO THRESHOLD RULES & SCHEDULED DOWNTIMES                 */}
          {/* ================================================================= */}
          {activeSubTab === 'cmk-rules' && (
            <div className="space-y-5">
              {/* Threshold Rules */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Checkmk Rule-Based Parameter & Threshold Rules ({rules.length})
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Specific host/service rules override global default rules automatically.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setRuleForm({
                        name: '',
                        description: '',
                        plugin: 'filesystem_usage',
                        hostId: '',
                        servicePattern: '',
                        warnThreshold: 80,
                        critThreshold: 90,
                        maxAttempts: 3,
                        checkIntervalSec: 60,
                        autoCreateTicket: true
                      });
                      setShowRuleModal(true);
                    }}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Threshold Rule</span>
                  </button>
                </div>

                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Rule Name</th>
                      <th className="py-2.5 px-3 font-semibold">Check Plugin</th>
                      <th className="py-2.5 px-3 font-semibold">Scope / Conditions</th>
                      <th className="py-2.5 px-3 font-semibold">WARN / CRIT</th>
                      <th className="py-2.5 px-3 font-semibold">Max Attempts</th>
                      <th className="py-2.5 px-3 font-semibold">Auto-Ticket</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{r.name}</div>
                          <div className="text-[10px] text-slate-500">{r.description}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {PLUGIN_LABELS[r.plugin] || r.plugin}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {r.hostId
                            ? `Host: ${hosts.find((h) => h.id === r.hostId)?.name || r.hostId}`
                            : r.servicePattern
                            ? `Service matches "${r.servicePattern}"`
                            : 'Global Default (All Hosts)'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] mr-1.5">
                            WARN {r.warnThreshold}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                            CRIT {r.critThreshold}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {r.maxAttempts} attempts ({r.checkIntervalSec}s)
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.autoCreateTicket ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                            {r.autoCreateTicket ? 'Auto-PSA Ticket' : 'Monitor Only'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                setRuleForm({
                                  id: r.id,
                                  name: r.name,
                                  description: r.description,
                                  plugin: r.plugin,
                                  hostId: r.hostId || '',
                                  servicePattern: r.servicePattern || '',
                                  warnThreshold: r.warnThreshold,
                                  critThreshold: r.critThreshold,
                                  maxAttempts: r.maxAttempts,
                                  checkIntervalSec: r.checkIntervalSec,
                                  autoCreateTicket: r.autoCreateTicket
                                });
                                setShowRuleModal(true);
                              }}
                              className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void handleDeleteRule(r.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Scheduled Maintenance Downtimes */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-sky-50/50">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Scheduled Maintenance Downtimes ({downtimes.length} Active)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Hosts and services in scheduled downtime suppress automatic ticket creation and unhandled problem counters.
                    </p>
                  </div>
                  {hosts[0] && (
                    <button
                      onClick={() => setDowntimeModal({ hostId: hosts[0].id, hostName: hosts[0].name })}
                      className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>Schedule Downtime</span>
                    </button>
                  )}
                </div>

                {downtimes.length === 0 ? (
                  <div className="p-5 text-xs text-slate-500 text-center">
                    No active maintenance downtime windows scheduled.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-left">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Host / Service</th>
                        <th className="py-2 px-3 font-semibold">Reason / Comment</th>
                        <th className="py-2 px-3 font-semibold">Window Start → End</th>
                        <th className="py-2 px-3 font-semibold">Author</th>
                        <th className="py-2 px-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {downtimes.map((dt) => (
                        <tr key={dt.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {dt.hostName}
                            {dt.serviceName && <span className="text-slate-500 font-normal"> › {dt.serviceName}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{dt.comment}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {new Date(dt.startTime).toLocaleString()} → {new Date(dt.endTime).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{dt.createdBy}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => void handleDeleteDowntime(dt.id)}
                              className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold cursor-pointer"
                            >
                              End Downtime
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: RRD TIME-SERIES PERFORMANCE GRAPH                            */}
      {/* ===================================================================== */}
      {graphService && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${SVC_STATE_STYLE[graphService.state].bg} ${SVC_STATE_STYLE[graphService.state].text}`}>
                    {graphService.state}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {graphService.hostName} — {graphService.serviceName}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">{graphService.summary}</p>
              </div>
              <button
                onClick={() => setGraphService(null)}
                className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Close
              </button>
            </div>

            {(() => {
              const pts = graphService.metricsHistory || [];
              const unit = graphService.perfData?.[0]?.unit || '';
              const warn = graphService.perfData?.[0]?.warn;
              const crit = graphService.perfData?.[0]?.crit;
              const vals = pts.map((p) => p.value);
              const minVal = vals.length ? Math.min(...vals) : 0;
              const maxVal = vals.length ? Math.max(...vals) : 0;
              const avgVal = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
              const curVal = vals.length ? vals[vals.length - 1] : 0;

              const W = 580;
              const H = 200;
              const yMax = Math.max(maxVal * 1.15, crit ? crit * 1.1 : 100, 10);
              const toX = (i: number) => 40 + (i / Math.max(1, pts.length - 1)) * (W - 60);
              const toY = (v: number) => H - 28 - (Math.max(0, v) / yMax) * (H - 48);

              const linePoints = pts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
              const areaPoints = pts.length > 1
                ? `${toX(0).toFixed(1)},${H - 28} ${linePoints} ${toX(pts.length - 1).toFixed(1)},${H - 28}`
                : '';

              return (
                <div className="space-y-3">
                  <div className="bg-slate-950 rounded-xl p-4 text-white">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                      <span>Checkmk RRD Performance Telemetry ({graphService.plugin})</span>
                      <div className="flex items-center gap-4">
                        {typeof warn === 'number' && <span className="text-amber-400">-- WARN: {warn}{unit}</span>}
                        {typeof crit === 'number' && <span className="text-rose-400">-- CRIT: {crit}{unit}</span>}
                      </div>
                    </div>

                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48 overflow-visible">
                      {/* Horizontal grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                        const y = H - 28 - f * (H - 48);
                        const labelVal = Math.round(f * yMax);
                        return (
                          <g key={f}>
                            <line x1={40} y1={y} x2={W - 20} y2={y} stroke="#1e293b" strokeWidth={1} />
                            <text x={34} y={y + 3} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
                              {labelVal}{unit}
                            </text>
                          </g>
                        );
                      })}

                      {/* WARN line */}
                      {typeof warn === 'number' && warn <= yMax && (
                        <line
                          x1={40}
                          y1={toY(warn)}
                          x2={W - 20}
                          y2={toY(warn)}
                          stroke="#fbbf24"
                          strokeWidth={1.2}
                          strokeDasharray="4 4"
                        />
                      )}

                      {/* CRIT line */}
                      {typeof crit === 'number' && crit <= yMax && (
                        <line
                          x1={40}
                          y1={toY(crit)}
                          x2={W - 20}
                          y2={toY(crit)}
                          stroke="#f43f5e"
                          strokeWidth={1.2}
                          strokeDasharray="4 4"
                        />
                      )}

                      {/* Area fill + Line */}
                      {areaPoints && (
                        <polygon points={areaPoints} fill="rgba(16, 185, 129, 0.18)" />
                      )}
                      {linePoints && (
                        <polyline
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={2.2}
                          points={linePoints}
                        />
                      )}
                    </svg>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Current</div>
                      <div className="text-base font-black text-slate-900">{curVal} {unit}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Average</div>
                      <div className="text-base font-black text-slate-900">{avgVal} {unit}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Min</div>
                      <div className="text-base font-black text-slate-900">{minVal} {unit}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Max</div>
                      <div className="text-base font-black text-slate-900">{maxVal} {unit}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ACKNOWLEDGE HOST / SERVICE PROBLEM                           */}
      {/* ===================================================================== */}
      {ackModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Acknowledge Problem — {ackModal.label}
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Comment / Ticket Note</label>
                <input
                  type="text"
                  value={ackComment}
                  onChange={(e) => setAckComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 outline-none focus:border-indigo-500"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackSticky}
                  onChange={(e) => setAckSticky(e.target.checked)}
                />
                <span>Sticky acknowledgment (remains until service recovers to OK)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAckModal(null)}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitAck()}
                className="px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                Acknowledge Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: SCHEDULE MAINTENANCE DOWNTIME WINDOW                         */}
      {/* ===================================================================== */}
      {downtimeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Schedule Maintenance Downtime — {downtimeModal.hostName}
              {downtimeModal.serviceName ? ` › ${downtimeModal.serviceName}` : ' (All Services)'}
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Duration</label>
                <select
                  value={dtDurationMin}
                  onChange={(e) => setDtDurationMin(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours (Standard Cutover Window)</option>
                  <option value={240}>4 Hours</option>
                  <option value={480}>8 Hours</option>
                  <option value={1440}>24 Hours</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Maintenance Reason</label>
                <input
                  type="text"
                  value={dtComment}
                  onChange={(e) => setDtComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDowntimeModal(null)}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitDowntime()}
                className="px-3.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
              >
                Start Downtime Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: NEW ACTIVE SYNTHETIC CHECK                                   */}
      {/* ===================================================================== */}
      {showNewActiveCheck && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleCreateActiveCheck(e)}
            className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 shadow-2xl space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900">
              Create Checkmk Active Network Check
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Service Check Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BLB-FS1 SMB Port 445 or Municipal Portal HTTPS"
                  value={newCheckForm.name}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Active Check Type</label>
                <select
                  value={newCheckForm.type}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, type: e.target.value as CheckmkActiveCheckType }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
                >
                  <option value="http_tls">HTTP / HTTPS + SSL Cert Expiry</option>
                  <option value="tcp_port">TCP Port Handshake (SMB/SQL/RDP)</option>
                  <option value="dns_lookup">DNS Record Resolution</option>
                  <option value="icmp_ping">PING / Network Latency Probe</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Attach to Host (Optional)</label>
                <select
                  value={newCheckForm.hostId}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, hostId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
                >
                  <option value="">Control Plane Synthetic Probe Host</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>{h.name} ({h.ipAddress})</option>
                  ))}
                </select>
              </div>

              <div className={newCheckForm.type === 'tcp_port' ? 'col-span-1' : 'col-span-2'}>
                <label className="block font-semibold text-slate-700 mb-1">
                  {newCheckForm.type === 'http_tls' ? 'Target URL' : newCheckForm.type === 'dns_lookup' ? 'Domain Name' : 'Target IP or Hostname'}
                </label>
                <input
                  type="text"
                  required
                  value={newCheckForm.target}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, target: e.target.value }))}
                  placeholder={newCheckForm.type === 'http_tls' ? 'https://example.com' : '192.168.2.253'}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 font-mono"
                />
              </div>

              {newCheckForm.type === 'tcp_port' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">TCP Port</label>
                  <input
                    type="number"
                    value={newCheckForm.port}
                    onChange={(e) => setNewCheckForm((p) => ({ ...p, port: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Latency WARN (ms)</label>
                <input
                  type="number"
                  value={newCheckForm.warnMs}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, warnMs: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Latency CRIT (ms)</label>
                <input
                  type="number"
                  value={newCheckForm.critMs}
                  onChange={(e) => setNewCheckForm((p) => ({ ...p, critMs: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newCheckForm.autoCreateTicket}
                onChange={(e) => setNewCheckForm((p) => ({ ...p, autoCreateTicket: e.target.checked }))}
              />
              <span>Automatically open a High-Priority PSA Ticket on HARD CRITICAL failure</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewActiveCheck(false)}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              >
                Save & Run Probe Now
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: CREATE / EDIT WATO THRESHOLD RULE                            */}
      {/* ===================================================================== */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveRule(e)}
            className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 shadow-2xl space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900">
              {ruleForm.id ? 'Edit Checkmk Threshold Rule' : 'New Checkmk Threshold Rule'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. File Server F: Volume Strict Alert"
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Check Plugin</label>
                <select
                  value={ruleForm.plugin}
                  onChange={(e) => setRuleForm((p) => ({ ...p, plugin: e.target.value as CheckmkCheckPlugin }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
                >
                  {Object.entries(PLUGIN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scope to Specific Host</label>
                <select
                  value={ruleForm.hostId}
                  onChange={(e) => setRuleForm((p) => ({ ...p, hostId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white"
                >
                  <option value="">All Hosts (Global)</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">WARN Threshold</label>
                <input
                  type="number"
                  value={ruleForm.warnThreshold}
                  onChange={(e) => setRuleForm((p) => ({ ...p, warnThreshold: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">CRIT Threshold</label>
                <input
                  type="number"
                  value={ruleForm.critThreshold}
                  onChange={(e) => setRuleForm((p) => ({ ...p, critThreshold: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Check Attempts (SOFT→HARD)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={ruleForm.maxAttempts}
                  onChange={(e) => setRuleForm((p) => ({ ...p, maxAttempts: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Service Name Filter (Optional)</label>
                <input
                  type="text"
                  value={ruleForm.servicePattern}
                  onChange={(e) => setRuleForm((p) => ({ ...p, servicePattern: e.target.value }))}
                  placeholder="e.g. Filesystem F:/"
                  className="w-full px-3 py-2 rounded-md border border-slate-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={ruleForm.autoCreateTicket}
                onChange={(e) => setRuleForm((p) => ({ ...p, autoCreateTicket: e.target.checked }))}
              />
              <span>Auto-create PSA Ticket when check enters HARD CRITICAL state</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRuleModal(false)}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              >
                Save Rule & Re-Evaluate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CheckmkMonitoringView;
