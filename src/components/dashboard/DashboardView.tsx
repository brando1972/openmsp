import React from 'react';
import { useApp } from '../../data/AppContext';
import {
  Monitor,
  ShieldAlert,
  TicketCheck,
  KeyRound,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Zap,
  Sparkles,
  TrendingUp,
  Headphones,
  Laptop,
  HardDrive
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    devices,
    tickets,
    vaultItems,
    patches,
    setActiveTab,
    setSelectedDeviceId,
    setSelectedTicketId,
    setIsAiDrawerOpen,
    triggerAutomationRuleDryRun
  } = useApp();

  const totalEndpoints = devices.length;
  const criticalCount = devices.filter(d => d.health === 'critical').length;
  const warningCount = devices.filter(d => d.health === 'warning').length;
  const healthyCount = devices.filter(d => d.health === 'healthy').length;

  const openTickets = tickets.filter(t => t.status === 'new' || t.status === 'in_progress');
  const urgentTickets = tickets.filter(t => t.priority === 'urgent');

  const pendingPatches = patches.filter(p => !p.approved || p.installedDevicesCount < p.affectedDevicesCount);

  // Compute fleet security score
  const avgPatchCompliance = Math.round(devices.reduce((acc, d) => acc + d.patchCompliance, 0) / (devices.length || 1));
  const avgVaultStrength = Math.round(vaultItems.reduce((acc, v) => acc + v.strengthScore, 0) / (vaultItems.length || 1));

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar bg-slate-950 text-slate-100">
      {/* Top Welcome Banner & Quick AI Insight */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase tracking-wider mb-1">
              <Activity className="w-4 h-4 animate-pulse" />
              <span>Real-time Operational Overview</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Executive MSP Control Center</h1>
            <p className="text-slate-400 text-xs mt-1 max-w-xl">
              Monitoring 135 managed client endpoints, automated self-healing triggers, zero-trust Bitwarden vaults, and RustDesk remote relays.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAiDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition shadow-lg shadow-sky-500/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ask AI Copilot</span>
            </button>
            <button
              onClick={() => setActiveTab('remote-support')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs transition border border-slate-700"
            >
              <Headphones className="w-4 h-4 text-emerald-400" />
              <span>RustDesk Active Relays</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Endpoints */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-bold text-xs">Total Managed Endpoints</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-100">{totalEndpoints}</div>
            <div className="flex items-center gap-2 mt-2 text-xs font-semibold">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {healthyCount} Healthy
              </span>
              <span className="text-rose-400">
                {criticalCount} Critical
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: PSA SLA Tickets */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-bold text-xs">Active PSA Tickets</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <TicketCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-100">{openTickets.length}</div>
            <div className="flex items-center gap-2 mt-2 text-xs font-semibold">
              <span className="text-rose-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {urgentTickets.length} Urgent Priority
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Patch Compliance */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-bold text-xs">OS Patch Compliance</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-100">{avgPatchCompliance}%</div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-medium">
              <span>{pendingPatches.length} Pending KB Updates</span>
            </div>
          </div>
        </div>

        {/* Card 4: Bitwarden Vault Audit */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-bold text-xs">Bitwarden Vault Audit</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-100">{avgVaultStrength} / 100</div>
            <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400 font-semibold">
              <span>Zero-Trust 2FA Protected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Section Grid: Active Device Alerts & Urgent Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Device Telemetry Alerts */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h2 className="font-bold text-slate-100 text-sm">Real-time Endpoint Telemetry Alerts</h2>
            </div>
            <button
              onClick={() => setActiveTab('rmm')}
              className="text-xs text-sky-400 font-bold hover:underline flex items-center gap-1"
            >
              View All Endpoints <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3 flex-1">
            {devices.filter(d => d.health === 'critical' || d.health === 'warning').map(device => (
              <div
                key={device.id}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-4 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${device.health === 'critical' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {device.os === 'windows' ? <Laptop className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-200 text-xs flex items-center gap-2">
                      <span>{device.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">{device.clientName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      CPU: <span className={device.metrics.cpuUsage > 85 ? 'text-rose-400 font-bold' : ''}>{device.metrics.cpuUsage}%</span> •
                      RAM: <span className={device.metrics.ramUsage > 85 ? 'text-rose-400 font-bold' : ''}>{device.metrics.ramUsage}%</span> •
                      Disk: <span className={device.metrics.diskUsage > 85 ? 'text-rose-400 font-bold' : ''}>{device.metrics.diskUsage}%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => triggerAutomationRuleDryRun('rule-1', device.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-[11px] hover:bg-sky-500/20 transition"
                  >
                    <Zap className="w-3.5 h-3.5" /> Auto-Heal
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDeviceId(device.id);
                      setActiveTab('rmm');
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {devices.filter(d => d.health === 'critical' || d.health === 'warning').length === 0 && (
              <div className="p-8 text-center text-slate-500 font-medium text-xs">
                All managed endpoints are currently healthy.
              </div>
            )}
          </div>
        </div>

        {/* Right: PSA Tickets Requiring Attention */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <TicketCheck className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-slate-100 text-sm">Priority PSA Tickets & SLA Deadlines</h2>
            </div>
            <button
              onClick={() => setActiveTab('psa-tickets')}
              className="text-xs text-sky-400 font-bold hover:underline flex items-center gap-1"
            >
              Ticket Queue <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3 flex-1">
            {tickets.map(ticket => (
              <div
                key={ticket.id}
                onClick={() => {
                  setSelectedTicketId(ticket.id);
                  setActiveTab('psa-tickets');
                }}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sky-400 text-xs">{ticket.ticketNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ticket.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {ticket.priority.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-200 text-xs mt-1">{ticket.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{ticket.clientName} • Assigned: {ticket.assignedTech}</p>
                  </div>
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">SLA: <strong className="text-slate-200">{ticket.slaDueDate}</strong></span>
                  <span className="text-emerald-400 font-semibold">{ticket.comments.length} Comments</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
