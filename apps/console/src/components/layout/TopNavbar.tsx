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
  ExternalLink,
  Menu,
  HardDrive,
  Shield
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { 
    clients,
    selectedClientId,
    setSelectedClientId,
    createClient,
    isAddClientModalOpen,
    setIsAddClientModalOpen,
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
    devices,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    whiteLabel
  } = useApp();

  const [showTabMenu, setShowTabMenu] = useState(false);
  const [showNewTabMenu, setShowNewTabMenu] = useState(false);
  const [refreshingTabId, setRefreshingTabId] = useState<string | null>(null);

  // Add New Client Organization Modal state
  const [newClientName, setNewClientName] = useState('');
  const [newClientSite, setNewClientSite] = useState('Main Office');
  const [newClientDomain, setNewClientDomain] = useState('');
  const [newClientContactName, setNewClientContactName] = useState('');
  const [newClientContactEmail, setNewClientContactEmail] = useState('');
  const [newClientContactPhone, setNewClientContactPhone] = useState('');
  const [newClientSla, setNewClientSla] = useState<'Gold 24/7' | 'Silver 8/5' | 'Bronze Best Effort'>('Gold 24/7');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [clientCreateError, setClientCreateError] = useState<string | null>(null);

  const handleCreateClientSubmit = async (openAssetsAfter: boolean) => {
    if (!newClientName.trim()) {
      setClientCreateError('Client organization name is required.');
      return;
    }
    setClientCreateError(null);
    setIsCreatingClient(true);
    try {
      const created = await createClient({
        name: newClientName.trim(),
        domain: newClientDomain.trim(),
        contactName: newClientContactName.trim(),
        contactEmail: newClientContactEmail.trim(),
        contactPhone: newClientContactPhone.trim(),
        sites: [newClientSite.trim() || 'Main Office'],
        activeContract: 'Standard Managed Care',
        monthlySlaTier: newClientSla
      });
      setSelectedClientId(created.id);
      setIsAddClientModalOpen(false);
      setNewClientName('');
      setNewClientSite('Main Office');
      setNewClientDomain('');
      setNewClientContactName('');
      setNewClientContactEmail('');
      setNewClientContactPhone('');
      if (openAssetsAfter) {
        setActiveTab('rmm');
        window.dispatchEvent(new CustomEvent('apex:open-enroll-modal', { detail: { clientId: created.id } }));
      }
    } catch (err: any) {
      setClientCreateError(err?.message || 'Failed to create client organization.');
    } finally {
      setIsCreatingClient(false);
    }
  };

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
        return <KeyRound className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'patching':
        return <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case 'automations':
        return <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
      case 'ai-copilot':
        return <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      case 'security-soc':
        return <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'backups':
        return <HardDrive className="w-3.5 h-3.5 text-teal-400 shrink-0" />;
      case 'settings':
        return <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const handleTabClick = (tab: WorkspaceTab) => {
    setActiveTabId(tab.id);
    if (['dashboard', 'rmm', 'remote-support', 'psa-tickets', 'vault', 'ai-copilot', 'patching', 'automations', 'network-map', 'mdm', 'security-soc', 'backups', 'settings'].includes(tab.type)) {
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
    <header className="bg-[#0a0b10] border-b border-black z-30 shrink-0 select-none">
      {/* ========================================================================= */}
      {/* MOBILE TOPBAR (< md screens)                                              */}
      {/* ========================================================================= */}
      <div className="flex md:hidden h-[48px] items-center justify-between px-3">
        {/* Left: Hamburger & Brand */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="w-6 h-6 rounded-md bg-[#ff0055] text-white flex items-center justify-center font-black text-xs shadow-sm">
              S
            </div>
            <span className="font-bold text-white text-xs tracking-tight">
              {whiteLabel.companyName || 'OpenMSP'}
            </span>
            <span className="font-mono text-[9px] leading-none text-white/30 hover:text-[#ff10f0] hover:[text-shadow:0_0_6px_#ff10f0] transition" title={`v${__APP_VERSION__} · ${__BUILD_SHA__}`}>
              v{__APP_VERSION__}
            </span>
          </div>
        </div>

        {/* Right: Tenant, Relay Dot, Quick Ticket & AI */}
        <div className="flex items-center gap-2">
          {/* Compact Tenant Selector */}
          <div className="flex items-center gap-1 text-[11px] text-white/80 bg-white/10 border border-white/15 px-2 py-1 rounded max-w-[140px]">
            <select
              value={selectedClientId}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setIsAddClientModalOpen(true);
                  return;
                }
                setSelectedClientId(e.target.value);
              }}
              className="bg-transparent text-white font-medium outline-none cursor-pointer text-[11px] truncate w-full"
            >
              <option value="all" className="bg-slate-900 text-white">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white truncate">
                  {c.name}
                </option>
              ))}
              <option value="__add_new__" className="bg-slate-900 text-emerald-400 font-bold">
                + Add New Client...
              </option>
            </select>
          </div>
          <button
            onClick={() => setIsAddClientModalOpen(true)}
            className="w-7 h-7 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-300 flex items-center justify-center transition cursor-pointer shrink-0"
            title="Add New Client Organization"
          >
            <Building2 className="w-3.5 h-3.5" />
          </button>

          {/* RustDesk Relay Online Dot */}
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              rustDeskConfig.onlineState ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            }`}
            title={`Relay: ${rustDeskConfig.onlineState ? 'Active' : 'Down'}`}
          />

          {/* Quick Ticket + */}
          <button
            onClick={() => openTab({ type: 'psa-tickets', title: 'New Ticket' })}
            className="w-7 h-7 rounded bg-[#48ac3d] hover:bg-[#3ea033] text-white flex items-center justify-center transition shadow-xs cursor-pointer shrink-0"
            title="Create New Ticket"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* AI Sparkles */}
          <button
            onClick={() => setIsAiDrawerOpen(true)}
            className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-purple-300 flex items-center justify-center transition shrink-0"
            title="Launch Apex AI"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DESKTOP TOPBAR (>= md screens with full SuperOps tabs & controls)          */}
      {/* ========================================================================= */}
      <div className="hidden md:flex h-[46px] items-end justify-between px-3">
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
                  className="w-7 h-7 rounded border border-white/15 hover:border-white/30 text-white/70 hover:text-white flex items-center justify-center transition bg-white/5 cursor-pointer"
                  title="All Open Tabs"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Plus Button for Opening New Module Tab */}
                <button
                  onClick={() => setShowNewTabMenu(!showNewTabMenu)}
                  className="w-7 h-7 rounded border border-white/15 hover:border-white/30 text-white/70 hover:text-white flex items-center justify-center transition bg-white/5 cursor-pointer"
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
                        className="text-[10px] text-blue-600 hover:underline font-normal cursor-pointer"
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
                              className="p-1 hover:text-rose-600 rounded cursor-pointer"
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
                        { type: 'security-soc', title: 'Security & UniFi SOC' },
                        { type: 'backups', title: 'ApexVault Backups & BMR' },
                        { type: 'rmm', title: 'Assets & Endpoints' },
                        { type: 'psa-tickets', title: 'PSA Tickets' },
                        { type: 'vault', title: 'Bitwarden Vault' },
                        { type: 'remote-support', title: 'ApexConnect' },
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
                          className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded flex items-center gap-2 cursor-pointer"
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
            /* Classic Mode Fallback */
            <div className="flex items-center gap-2 mb-1.5 px-2">
              <span className="text-white text-xs font-bold capitalize">OpenMSP Workspace</span>
              <button
                onClick={() => setTabbedNavigationEnabled(true)}
                className="text-[10px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
              >
                Enable Tabs
              </button>
            </div>
          )}
        </div>

        {/* Right: SuperOps Stats, Tenant Selector, and Actions */}
        <div className="flex items-center gap-3 mb-1.5">
          {/* Trial & Account Stats Pill */}
          <div className="hidden xl:flex items-center gap-2 text-[11px] text-white/70 font-medium bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
            <span>Asset Limit : <strong className="text-white">150</strong></span>
            <span className="text-white/30">|</span>
            <span>Email Usage : <strong className="text-white">0 / 0</strong></span>
            <HelpCircle className="w-3 h-3 text-white/50" />
          </div>

          {/* Client Tenant Selector */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-xs text-white/80 bg-white/10 border border-white/15 px-2.5 py-1 rounded-md">
              <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <select
                value={selectedClientId}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') {
                    setIsAddClientModalOpen(true);
                    return;
                  }
                  setSelectedClientId(e.target.value);
                }}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-slate-900 text-slate-100">All MSP Clients ({clients.reduce((s, c) => s + (c.totalDevices || 0), 0)} Devices)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                    {c.name} ({c.totalDevices} Devices)
                  </option>
                ))}
                <option value="__add_new__" className="bg-slate-900 text-emerald-400 font-bold">
                  + Add New Client...
                </option>
              </select>
            </div>
            <button
              onClick={() => setIsAddClientModalOpen(true)}
              className="bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-300 hover:text-white font-semibold text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer"
              title="Add New Client Organization"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Client</span>
            </button>
          </div>

          {/* RustDesk Relay Status Pill */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
              rustDeskConfig.onlineState
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
            title="ApexConnect Relay"
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
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sky-300 transition relative cursor-pointer"
            title="Launch Apex AI Lab"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Build tag — glance to confirm this tab is on the latest deploy.
              Version bumps per commit; the short git SHA is injected at build. */}
          <span
            className="hidden lg:inline-flex items-center font-mono text-[10px] leading-none text-white/35 hover:text-[#ff10f0] hover:[text-shadow:0_0_6px_#ff10f0] transition select-text whitespace-nowrap"
            title={`ApexMSP console v${__APP_VERSION__} · build ${__BUILD_SHA__}`}
          >
            v{__APP_VERSION__}<span className="mx-0.5 text-white/20">·</span>{__BUILD_SHA__}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ADD NEW CLIENT ORGANIZATION MODAL                                         */}
      {/* ========================================================================= */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-2xl text-slate-900 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Add New Client Organization</h2>
                  <p className="text-slate-500 text-xs">Create a customer tenant to enroll assets, policies, and tickets</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddClientModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {clientCreateError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {clientCreateError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Client / Organization Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="e.g., Southern Tech Support"
                    autoFocus
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Site / Location</label>
                  <input
                    type="text"
                    value={newClientSite}
                    onChange={(e) => setNewClientSite(e.target.value)}
                    placeholder="e.g., Main Office"
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Domain / Website</label>
                  <input
                    type="text"
                    value={newClientDomain}
                    onChange={(e) => setNewClientDomain(e.target.value)}
                    placeholder="e.g., southerntechsupport.com"
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SLA Service Tier</label>
                  <select
                    value={newClientSla}
                    onChange={(e) => setNewClientSla(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Gold 24/7">Gold 24/7 Managed</option>
                    <option value="Silver 8/5">Silver 8/5 Standard</option>
                    <option value="Bronze Best Effort">Bronze Break/Fix</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Contact</label>
                  <input
                    type="text"
                    value={newClientContactName}
                    onChange={(e) => setNewClientContactName(e.target.value)}
                    placeholder="Contact Name"
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={newClientContactEmail}
                    onChange={(e) => setNewClientContactEmail(e.target.value)}
                    placeholder="contact@client.com"
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newClientContactPhone}
                    onChange={(e) => setNewClientContactPhone(e.target.value)}
                    placeholder="555-0100"
                    className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setIsAddClientModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isCreatingClient || !newClientName.trim()}
                onClick={() => handleCreateClientSubmit(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isCreatingClient ? 'Creating...' : 'Create Client'}
              </button>
              <button
                disabled={isCreatingClient || !newClientName.trim()}
                onClick={() => handleCreateClientSubmit(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingClient ? 'Creating...' : 'Create & Add Asset →'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
