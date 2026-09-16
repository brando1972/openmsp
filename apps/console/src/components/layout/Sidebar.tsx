import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { RoadmapNav } from './RoadmapNav';
import { NavigationTab } from '../../types';
import {
  LayoutDashboard,
  Bell,
  Search,
  Layers,
  PlusCircle,
  Settings,
  Calendar,
  Timer,
  Network,
  LogOut,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Folder,
  FolderOpen,
  Plus,
  Radio,
  Server,
  Monitor,
  Laptop,
  Smartphone,
  Wifi,
  Printer,
  Shield,
  Zap,
  Ticket,
  KeyRound,
  Bot,
  UserCheck,
  Headphones
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    openTab,
    tickets,
    devices,
    automations,
    whiteLabel,
    currentUser,
    logout,
    setIsCommandPaletteOpen,
    setIsAiDrawerOpen,
    activeTimersCount,
    activeSubRailView,
    setActiveSubRailView,
    isSubRailCollapsed,
    setIsSubRailCollapsed
  } = useApp();

  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Category collapse states for sub-rail
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overviews: true,
    alerts: true,
    assetViews: true,
    taskViews: true,
    ticketViews: true,
    networkMonitoring: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const openTicketsCount = tickets.filter(t => t.status === 'new' || t.status === 'in_progress').length;
  const criticalDevicesCount = devices.filter(d => d.health === 'critical' || d.health === 'warning').length;
  const onlineDevicesCount = devices.filter(d => d.health !== 'offline').length;

  const handleNavClick = (tabId: NavigationTab) => {
    setActiveTab(tabId);
  };

  return (
    <div className="hidden md:flex h-full select-none shrink-0 z-20">
      {/* ========================================================================= */}
      {/* LEVEL 1: Primary Icon Rail (60px fixed width, pitch black #0a0b10)        */}
      {/* ========================================================================= */}
      <aside className="w-[60px] bg-[#0a0b10] border-r border-white/10 flex flex-col justify-between items-center py-3 shrink-0 text-white z-30">
        {/* Top: Logo & Main Navigation Icons */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Neon Pink SuperOps Brand Mark */}
          <button
            onClick={() => handleNavClick('dashboard')}
            className="w-9 h-9 rounded-lg bg-[#ff0055] hover:bg-[#e0004c] text-white flex items-center justify-center font-black text-lg shadow-lg shadow-pink-500/25 transition cursor-pointer"
            title={whiteLabel.companyName || 'OpenMSP'}
          >
            S
          </button>

          <div className="w-8 h-px bg-white/10 my-0.5" />

          {/* Navigation Icon Stack */}
          <div className="flex flex-col items-center gap-1.5 w-full px-2">
            {/* Home / Dashboard */}
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Home Dashboard"
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>

            {/* Updates / Activity */}
            <button
              onClick={() => handleNavClick('automations')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer relative ${
                activeTab === 'automations'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Updates & Self-Healing Automations"
            >
              <Bell className="w-5 h-5" />
              {automations.length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#ff0055]" />
              )}
            </button>

            {/* Quick Search */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Quick Search (Ctrl + K)"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Modules / Assets (RMM) */}
            <button
              onClick={() => handleNavClick('rmm')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer relative ${
                activeTab === 'rmm'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Asset Management & RMM Endpoints"
            >
              <Layers className="w-5 h-5" />
              {criticalDevicesCount > 0 && (
                <span className="absolute top-1.5 right-1.5 px-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-[9px] font-bold flex items-center justify-center text-white">
                  {criticalDevicesCount}
                </span>
              )}
            </button>

            {/* PSA Tickets */}
            <button
              onClick={() => handleNavClick('psa-tickets')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer relative ${
                activeTab === 'psa-tickets'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="PSA Ticketing Workspace"
            >
              <Ticket className="w-5 h-5" />
              {openTicketsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 px-1 min-w-[14px] h-[14px] rounded-full bg-amber-500 text-[9px] font-bold flex items-center justify-center text-white">
                  {openTicketsCount}
                </span>
              )}
            </button>

            {/* Remote Support */}
            <button
              onClick={() => handleNavClick('remote-support')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
                activeTab === 'remote-support'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="ApexConnect Remote Support"
            >
              <Headphones className="w-5 h-5" />
            </button>

            {/* Network Map — discovery & topology */}
            <button
              onClick={() => handleNavClick('network-map')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
                activeTab === 'network-map'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Network Map — device discovery & topology"
            >
              <Network className="w-5 h-5" />
            </button>

            {/* Bitwarden Vault */}
            <button
              onClick={() => handleNavClick('vault')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
                activeTab === 'vault'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Bitwarden Zero-Trust Vault"
            >
              <KeyRound className="w-5 h-5" />
            </button>

            {/* AI Copilot */}
            <button
              onClick={() => setIsAiDrawerOpen(true)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sky-400 hover:text-sky-300 hover:bg-white/10 transition cursor-pointer relative"
              title="Apex AI Assistant"
            >
              <Bot className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            </button>

            {/* Settings */}
            <button
              onClick={() => handleNavClick('settings')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-white/15 text-white font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title="Settings & Workspace Preferences"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom Icons: Scheduling, Worklog Timers, Network Probes, User Avatar */}
        <div className="flex flex-col items-center gap-2 w-full px-2">
          {/* Calendar / Scheduling */}
          <button
            onClick={() => handleNavClick('dashboard')}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Calendar & Technician Scheduling"
          >
            <Calendar className="w-4 h-4" />
          </button>

          {/* Worklog Timer with Red Badge (SuperOps Style) */}
          <button
            onClick={() => handleNavClick('psa-tickets')}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer relative"
            title={`${activeTimersCount} Active Worklog Timers`}
          >
            <Timer className="w-4 h-4" />
            {activeTimersCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[15px] h-[15px] rounded-full bg-[#ff0055] text-white text-[9px] font-black flex items-center justify-center shadow">
                {activeTimersCount}
              </span>
            )}
          </button>

          {/* Network Probes & Marketplace */}
          <button
            onClick={() => handleNavClick('network-map')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition cursor-pointer ${
              activeTab === 'network-map'
                ? 'bg-white/15 text-white font-bold'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Network Discovery & Topology"
          >
            <Network className="w-4 h-4" />
          </button>

          <div className="w-8 h-px bg-white/10 my-0.5" />

          {/* User Profile Avatar with Online Status */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-white/20 hover:ring-white/40 transition cursor-pointer"
              title={currentUser?.name || 'Brandon Ray'}
            >
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'B'}
            </button>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0b10]" />

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute bottom-0 left-12 w-48 bg-white border border-slate-200 rounded-lg shadow-xl p-2 text-slate-800 text-xs z-50">
                <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
                  <div className="font-bold text-slate-900 truncate">{currentUser?.name || 'Brandon Ray'}</div>
                  <div className="text-[10px] text-slate-500 capitalize">{currentUser?.role || 'Lead MSP Tech'}</div>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleNavClick('settings');
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded flex items-center gap-2"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Preferences</span>
                </button>
                <button
                  onClick={() => logout()}
                  className="w-full text-left px-2 py-1.5 hover:bg-rose-50 text-rose-600 rounded flex items-center gap-2 mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* LEVEL 2: Secondary Sub-Navigation Rail (240px width, soft lilac/gray)     */}
      {/* ========================================================================= */}
      {!isSubRailCollapsed && (
        <aside className="w-[240px] bg-[#f7f7fd] border-r border-slate-200 flex flex-col justify-between overflow-hidden shrink-0 text-slate-700">
          {/* Top Search in Sub-Nav */}
          <div className="p-3 border-b border-slate-200/80 bg-[#f7f7fd]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={subSearchQuery}
                onChange={(e) => setSubSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-white border border-slate-200 focus:border-slate-400 text-slate-800 placeholder-slate-400 text-xs pl-8 pr-3 py-1.5 rounded-md outline-none transition"
              />
            </div>
          </div>

          {/* Roadmap navigation tree — folds every view into one SuperOps-style grouped menu */}
          <RoadmapNav />

          {/* Bottom: SuperOps Circular Health Progress Dial (0%) + Collapse Trigger */}
          <div className="p-3 border-t border-slate-200 bg-[#f7f7fd] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Circular Gauge */}
              <div className="w-10 h-10 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 flex items-center justify-center font-bold text-[10px] text-indigo-700 bg-white shadow-sm">
                0%
              </div>
              <div className="leading-tight">
                <div className="font-bold text-[11px] text-slate-800">SLA & Health</div>
                <div className="text-[10px] text-slate-400">All systems 100%</div>
              </div>
            </div>

            <button
              onClick={() => setIsSubRailCollapsed(true)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              title="Collapse Secondary Rail"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* When sub-rail is collapsed, show subtle uncollapse tab */}
      {isSubRailCollapsed && (
        <button
          onClick={() => setIsSubRailCollapsed(false)}
          className="w-3 bg-slate-200 hover:bg-slate-300 text-slate-500 flex items-center justify-center transition border-r border-slate-300"
          title="Expand Secondary Rail"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};


