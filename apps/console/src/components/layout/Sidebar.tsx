import React from 'react';
import { useApp } from '../../data/AppContext';
import {
  NavigationTab
} from '../../types';
import {
  LayoutDashboard,
  Monitor,
  Headphones,
  TicketCheck,
  KeyRound,
  Bot,
  ShieldCheck,
  Zap,
  Settings,
  Sparkles,
  LogOut
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, setIsAiDrawerOpen, tickets, devices, whiteLabel, currentUser, logout } = useApp();

  const openTicketsCount = tickets.filter(t => t.status === 'new' || t.status === 'in_progress').length;
  const criticalDevicesCount = devices.filter(d => d.health === 'critical' || d.health === 'warning').length;

  const navItems: { id: NavigationTab; label: string; icon: React.FC<{ className?: string }>; badge?: number; badgeColor?: string }[] = [
    { id: 'dashboard', label: 'Command Hub', icon: LayoutDashboard },
    { id: 'rmm', label: 'RMM Endpoints', icon: Monitor, badge: criticalDevicesCount > 0 ? criticalDevicesCount : undefined, badgeColor: 'bg-rose-500' },
    { id: 'remote-support', label: 'RustDesk Support', icon: Headphones },
    { id: 'psa-tickets', label: 'PSA Ticketing', icon: TicketCheck, badge: openTicketsCount > 0 ? openTicketsCount : undefined, badgeColor: 'bg-amber-500' },
    { id: 'vault', label: 'Bitwarden Vault', icon: KeyRound },
    { id: 'patching', label: 'Patch Management', icon: ShieldCheck },
    { id: 'automations', label: 'Self-Healing AI', icon: Zap },
    { id: 'ai-copilot', label: 'Apex AI Lab', icon: Bot },
    { id: 'settings', label: 'White-Label Branding', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 text-slate-300 select-none">
      {/* MSP Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-500 to-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-sky-500/20 shrink-0">
            {whiteLabel.companyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-100 text-base leading-tight tracking-tight truncate" title={whiteLabel.companyName}>
              {whiteLabel.companyName}
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Enterprise PSA & RMM</p>
          </div>
        </div>
      </div>

      {/* Main Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Platform Operations
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30 shadow-sm font-semibold'
                  : 'hover:bg-slate-800/60 hover:text-slate-100 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${item.badgeColor || 'bg-sky-500'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick AI Trigger Button & User Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-950/50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Launch AI Copilot</span>
        </button>

        {/* User Card with Logout */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-sky-400/30">
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AR'}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs font-semibold text-slate-200 truncate">{currentUser?.name || 'Alex Rivera'}</div>
              <div className="text-[10px] text-slate-500 capitalize truncate">{currentUser?.role || 'Admin'}</div>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

