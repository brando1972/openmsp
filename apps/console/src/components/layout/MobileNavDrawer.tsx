import React from 'react';
import { useApp } from '../../data/AppContext';
import { NavigationTab } from '../../types';
import {
  LayoutDashboard,
  Layers,
  Ticket,
  Radio,
  Network,
  KeyRound,
  ShieldCheck,
  Zap,
  Bot,
  Settings,
  X,
  Building2,
  LogOut,
  ChevronRight,
  UserCheck
} from 'lucide-react';

export const MobileNavDrawer: React.FC = () => {
  const {
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    activeTab,
    setActiveTab,
    openTab,
    clients,
    selectedClientId,
    setSelectedClientId,
    devices,
    tickets,
    whiteLabel,
    currentUser,
    logout,
    setIsAiDrawerOpen,
    rustDeskConfig
  } = useApp();

  if (!isMobileMenuOpen) return null;

  const navigateTo = (tab: NavigationTab, title: string) => {
    setActiveTab(tab);
    openTab({ type: tab, title });
    setIsMobileMenuOpen(false);
  };

  const openTicketsCount = tickets.filter(t => t.status === 'new' || t.status === 'in_progress').length;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex select-none">
      {/* Backdrop */}
      <div
        onClick={() => setIsMobileMenuOpen(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-out Drawer */}
      <div className="relative w-[85%] max-w-[320px] bg-[#0a0b10] text-white flex flex-col h-full z-10 shadow-2xl overflow-hidden border-r border-white/10 animate-in slide-in-from-left duration-200">
        {/* Top Drawer Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff0055] text-white flex items-center justify-center font-black text-base shadow-md shadow-pink-500/30">
              S
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight">{whiteLabel.companyName || 'OpenMSP'}</div>
              <div className="text-[10px] text-white/50">Control Plane v1.0</div>
            </div>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-3 mx-3 my-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
              {currentUser?.name ? currentUser.name.charAt(0) : 'A'}
            </div>
            <div>
              <div className="text-xs font-semibold truncate max-w-[150px]">{currentUser?.name || 'Chief MSP Operator'}</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Online • {currentUser?.role?.toUpperCase() || 'OWNER'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="p-1.5 rounded text-white/50 hover:text-rose-400 hover:bg-white/10 transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Tenant Filter Selector */}
        <div className="px-4 py-2 border-b border-white/10 space-y-1.5">
          <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Active Tenant Scope</span>
          </div>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900 text-white">All MSP Clients ({devices.length} Devices)</option>
            {clients.map(c => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                {c.name} ({c.totalDevices} Devices)
              </option>
            ))}
          </select>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 text-xs">
          {/* Section 1: Core Operations */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Core Operations
            </div>

            <button
              onClick={() => navigateTo('dashboard', 'Home')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'dashboard' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span>Home Dashboard</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>

            <button
              onClick={() => navigateTo('rmm', 'Assets')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'rmm' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-pink-400" />
                <span>Assets &amp; Endpoints</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 text-[10px] font-semibold">
                {devices.length}
              </span>
            </button>

            <button
              onClick={() => navigateTo('psa-tickets', 'Tickets')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'psa-tickets' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Ticket className="w-4 h-4 text-blue-400" />
                <span>PSA Ticket Queue</span>
              </div>
              {openTicketsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#ff0055] text-white text-[10px] font-bold">
                  {openTicketsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => navigateTo('remote-support', 'Remote Support')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'remote-support' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>ApexConnect</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${rustDeskConfig.onlineState ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            </button>

            <button
              onClick={() => navigateTo('network-map', 'Network Map')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'network-map' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Network className="w-4 h-4 text-sky-400" />
                <span>Network Map</span>
              </div>
            </button>
          </div>

          {/* Section 2: Security & Management */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Security &amp; Policies
            </div>

            <button
              onClick={() => navigateTo('vault', 'Vault')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'vault' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Bitwarden Vault</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>

            <button
              onClick={() => navigateTo('patching', 'Patching')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'patching' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Patch Management</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>

            <button
              onClick={() => navigateTo('automations', 'Automations')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'automations' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>Self-Healing Rules</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsAiDrawerOpen(true);
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-lg text-purple-300 hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-2.5">
                <Bot className="w-4 h-4 text-purple-400" />
                <span>Apex AI Assistant</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-semibold">AI</span>
            </button>
          </div>

          {/* Section 3: Configuration */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Administration
            </div>

            <button
              onClick={() => navigateTo('settings', 'Settings')}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition ${
                activeTab === 'settings' ? 'bg-white/15 text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Branding &amp; Workspace Tabs</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>
          </div>
        </div>

        {/* Footer info & quick logout */}
        <div className="p-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
            <Radio className={`w-3 h-3 ${rustDeskConfig.onlineState ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span>Relay: {rustDeskConfig.onlineState ? 'Active' : 'Offline'}</span>
          </div>

          <button
            onClick={() => logout()}
            className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
