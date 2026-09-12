import React, { useState, useEffect } from 'react';
import { useApp } from '../../data/AppContext';
import { NavigationTab, WorkspaceTab } from '../../types';
import { 
  Building2, 
  Radio, 
  RotateCw, 
  X, 
  ChevronDown, 
  Plus, 
  Sparkles, 
  Check, 
  LayoutDashboard, 
  Layers, 
  Ticket, 
  Headphones, 
  KeyRound, 
  ShieldCheck, 
  Zap, 
  Bot, 
  Settings,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { 
    clients,
    selectedClientId,
    setSelectedClientId,
    setIsCommandPaletteOpen,
    setIsAiDrawerOpen,
    rustDeskConfig,
    tabs,
    activeTabId,
    setActiveTabId,
    openTab,
    closeTab,
    refreshTab,
    tabbedNavigationEnabled,
    setTabbedNavigationEnabled,
    setActiveTab,
    devices
  } = useApp();

  const [showTabMenu, setShowTabMenu] = useState(false);
  const [showNewTabMenu, setShowNewTabMenu] = useState(false);
  const [refreshingTabId, setRefreshingTabId] = useState<string | null>(null);

  const getTabIcon = (type: string) => {
    switch (type) {
      case 'dashboard':
        return <LayoutDashboard className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case 'rmm':
        return <Layers className="w-3.5 h-3.5 text-pink-500 shrink-0" />;
      case 'psa-tickets':
        return <Ticket className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'remote-support':
        return <Headphones className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'vault':
        return <KeyRound className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
      case 'patching':
        return <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
      case 'automations':
        return <Zap className="w-3.5 h-3.5 text-teal-500 shrink-0" />;
      case 'ai-copilot':
        return <Bot className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
      case 'settings':
        return <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const handleTabClick = (tab: WorkspaceTab) => {
    setActiveTabId(tab.id);
    if (['dashboard', 'rmm', 'remote-support', 'psa-tickets', 'vault', 'ai-copilot', 'patching', 'automations', 'settings'].includes(tab.type)) {
      setActiveTab(tab.type as NavigationTab);
    }
  };

  const handleRefresh = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    setRefreshingTabId(tabId);
    refreshTab(tabId);
    setTimeout(() => setRefreshingTabId(null), 800);
  };

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  return (
    <header className="h-[46px] bg-[#0a0b10] border-b border-black flex items-end justify-between px-3 z-30 shrink-0 select-none">
      {/* Left: SuperOps Browser-Style Tabs */}
      <div className="flex items-end gap-1 overflow-x-auto custom-scrollbar max-w-[65%] shrink-0">
        {tabbedNavigationEnabled ? (
          <>
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isRefreshing = refreshingTabId === tab.id;

              return (
                <div
                  key={tab.id}
                  onClick={() => handleTabClick(tab)}
                  className={`group relative flex items-center gap-2 px-3.5 h-[38px] cursor-pointer transition-all duration-150 shrink-0 ${
                    isActive
                      ? 'bg-white text-slate-900 font-semibold shadow-sm z-10'
                      : 'bg-[#0a0b10] hover:bg-white/10 text-white/70 hover:text-white'
                  }`}
                  style={{ borderRadius: '10px 10px 0 0' }}
                >
                  {/* Tab Icon */}
                  {getTabIcon(tab.type)}

                  {/* Tab Title */}
                  <span className="text-xs font-medium truncate max-w-[130px]" title={tab.title}>
                    {tab.title}
                  </span>

                  {/* Refresh Button (visible when active) */}
                  {isActive && (
                    <button
                      onClick={(e) => handleRefresh(e, tab.id)}
                      className="p-1 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition"
                      title="Refresh view"
                    >
                      <RotateCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
                    </button>
                  )}

                  {/* Close Tab Button */}
                  {tab.closable && (
                    <button
                      onClick={(e) => handleClose(e, tab.id)}
                      className={`p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 text-white/60 hover:text-white hover:bg-white/20'
                      }`}
                      title="Close Tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Tab Controls: Dropdown chevron and + button */}
            <div className="flex items-center gap-1 mb-1 ml-1 shrink-0 relative">
              {/* Dropdown Chevron for All Tabs */}
              <button
                onClick={() => setShowTabMenu(!showTabMenu)}
                className="w-7 h-7 rounded border border-white/15 hover:border-white/30 text-white/70 hover:text-white flex items-center justify-center transition bg-white/5"
                title="All Open Tabs"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {/* Plus Button for Opening New Module Tab */}
              <button
                onClick={() => setShowNewTabMenu(!showNewTabMenu)}
                className="w-7 h-7 rounded border border-white/15 hover:border-white/30 text-white/70 hover:text-white flex items-center justify-center transition bg-white/5"
                title="Open New Tab"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Tab Dropdown Menu */}
              {showTabMenu && (
                <div className="absolute top-8 left-0 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-2 text-slate-800 text-xs z-50">
                  <div className="font-bold text-slate-900 px-2 py-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Open Tabs ({tabs.length})</span>
                    <button
                      onClick={() => setTabbedNavigationEnabled(!tabbedNavigationEnabled)}
                      className="text-[10px] text-blue-600 hover:underline font-normal"
                    >
                      Disable Tabs
                    </button>
                  </div>
                  <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
                    {tabs.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          handleTabClick(t);
                          setShowTabMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between ${
                          t.id === activeTabId ? 'bg-slate-100 font-bold text-slate-900' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getTabIcon(t.type)}
                          <span className="truncate">{t.title}</span>
                        </div>
                        {t.closable && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              closeTab(t.id);
                            }}
                            className="p-1 hover:text-rose-600 rounded"
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* New Tab Picker Menu */}
              {showNewTabMenu && (
                <div className="absolute top-8 left-8 w-56 bg-white border border-slate-200 rounded-lg shadow-xl p-2 text-slate-800 text-xs z-50">
                  <div className="font-bold text-slate-900 px-2 py-1 border-b border-slate-100">
                    Open Module in Tab
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {[
                      { type: 'dashboard', title: 'Home Dashboard' },
                      { type: 'rmm', title: 'Assets & Endpoints' },
                      { type: 'psa-tickets', title: 'PSA Tickets' },
                      { type: 'vault', title: 'Bitwarden Vault' },
                      { type: 'remote-support', title: 'RustDesk Remote' },
                      { type: 'patching', title: 'Patch Management' },
                      { type: 'automations', title: 'Automations' },
                      { type: 'settings', title: 'Settings' }
                    ].map(item => (
                      <button
                        key={item.type}
                        onClick={() => {
                          openTab({ type: item.type as NavigationTab, title: item.title });
                          setShowNewTabMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded flex items-center gap-2"
                      >
                        {getTabIcon(item.type)}
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Classic Mode Fallback: single pill with option to enable tabs */
          <div className="flex items-center gap-2 mb-1.5 px-2">
            <span className="text-white text-xs font-bold capitalize">OpenMSP Workspace</span>
            <button
              onClick={() => setTabbedNavigationEnabled(true)}
              className="text-[10px] text-sky-400 hover:text-sky-300 underline"
            >
              Enable Tabs
            </button>
          </div>
        )}
      </div>

      {/* Right: SuperOps Stats, Tenant Selector, and Actions */}
      <div className="flex items-center gap-3 mb-1.5">
        {/* Trial & Account Stats Pill (matching SuperOps header) */}
        <div className="hidden xl:flex items-center gap-2 text-[11px] text-white/70 font-medium bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
          <span>Asset Limit : <strong className="text-white">150</strong></span>
          <span className="text-white/30">|</span>
          <span>Email Usage : <strong className="text-white">0 / 0</strong></span>
          <HelpCircle className="w-3 h-3 text-white/50" />
        </div>

        {/* Client Tenant Selector */}
        <div className="flex items-center gap-1.5 text-xs text-white/80 bg-white/10 border border-white/15 px-2.5 py-1 rounded-md">
          <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="bg-transparent text-white font-semibold outline-none cursor-pointer text-xs"
          >
            <option value="all" className="bg-slate-900 text-slate-100">All MSP Clients ({devices.length} Devices)</option>
            {clients.map(c => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                {c.name} ({c.totalDevices} Devices)
              </option>
            ))}
          </select>
        </div>

        {/* RustDesk Relay Status Pill */}
        <div
          className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
            rustDeskConfig.onlineState
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
          title="RustDesk Relay Server"
        >
          <Radio className={`w-3 h-3 ${rustDeskConfig.onlineState ? 'animate-pulse' : ''}`} />
          <span>{rustDeskConfig.onlineState ? 'Relay Active' : 'Relay Down'}</span>
        </div>

        {/* SuperOps Green Action Button */}
        <button
          onClick={() => {
            openTab({ type: 'psa-tickets', title: 'New Ticket' });
          }}
          className="bg-[#48ac3d] hover:bg-[#3ea033] text-white font-semibold text-xs px-3 py-1.5 rounded transition shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Ticket</span>
        </button>

        {/* AI Copilot Sparkles Button */}
        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sky-300 transition relative"
          title="Launch Apex AI Lab"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
        </button>
      </div>
    </header>
  );
};
