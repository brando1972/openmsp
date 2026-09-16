import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import type { NavigationTab } from '../../types';
import {
  LayoutDashboard, Ticket, MapPin, ListChecks, Briefcase, Clock, CalendarDays,
  Monitor, Bell, ShieldCheck, Code2, Activity, Headphones, KeyRound,
  Store, Package, ScrollText, BadgeCheck, Receipt, FileText, Inbox,
  FileCode, BookOpen, Smartphone, AppWindow, SlidersHorizontal, FolderOpen,
  Settings, BarChart3, Bot, ChevronDown, ChevronRight, Server, Laptop, Wifi, Printer,
  type LucideIcon
} from 'lucide-react';

/**
 * RoadmapNav — the SuperOps-style grouped navigation tree that replaces the old
 * contextual sub-rail. It folds every existing view into one menu (Assets keeps
 * its asset-view filters as children, Tickets keeps its ticket views, etc.),
 * routes built modules to their live views, embeds ApexMDM under MDM Management,
 * and shows not-yet-built modules muted so the whole thing doubles as a roadmap.
 * Nothing that worked before is lost — only where the menu lives and how it looks.
 */

type Item = {
  key: string;
  label: string;
  Icon: LucideIcon;
  tint: string;
  built: boolean;
  tab?: NavigationTab;     // navigate to this in-app view
  sub?: string;            // also set activeSubRailView to this
  href?: string;           // '/path' → same-tab route; 'http…' → new tab
  ai?: boolean;            // open the AI drawer
  badge?: string;          // e.g. 'New'
  children?: Item[];       // sub-views (folded-in filters)
};
type Group = { title: string; items: Item[] };

// Asset-view filters, folded in as children of "Assets" (keys unchanged so the
// Assets view keeps filtering exactly as before).
const ASSET_CHILDREN: Item[] = [
  { key: 'all-assets', label: 'All Assets', Icon: FolderOpen, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'all-assets' },
  { key: 'monitored', label: 'Monitored Assets', Icon: Monitor, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'monitored' },
  { key: 'endpoints', label: 'Endpoints', Icon: Laptop, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'endpoints' },
  { key: 'mdm-tablets', label: 'Managed Devices', Icon: Smartphone, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'mdm-tablets' },
  { key: 'servers', label: 'Servers', Icon: Server, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'servers' },
  { key: 'macos', label: 'Apple macOS', Icon: Laptop, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'macos' },
  { key: 'windows', label: 'Windows', Icon: Monitor, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'windows' },
  { key: 'network', label: 'Network Assets', Icon: Wifi, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'network' },
  { key: 'printers', label: 'Printers', Icon: Printer, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'printers' },
  { key: 'inactive', label: 'Inactive Assets', Icon: FolderOpen, tint: '#8b5cf6', built: true, tab: 'rmm', sub: 'inactive' }
];

const TICKET_CHILDREN: Item[] = [
  { key: 'all-tickets', label: 'All Tickets', Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'all-tickets' },
  { key: 'my-tickets', label: 'My Tickets', Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'my-tickets' },
  { key: 'open-tickets', label: 'Open Tickets', Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'open-tickets' },
  { key: 'unassigned', label: 'Unassigned', Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'unassigned' },
  { key: 'following', label: "I'm Following", Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'following' }
];

const GROUPS: Group[] = [
  {
    title: 'Overviews',
    items: [
      { key: 'home', label: 'Home', Icon: LayoutDashboard, tint: '#6366f1', built: true, tab: 'dashboard' }
    ]
  },
  {
    title: 'Work Management',
    items: [
      { key: 'tickets', label: 'Tickets', Icon: Ticket, tint: '#f43f5e', built: true, tab: 'psa-tickets', sub: 'all-tickets', children: TICKET_CHILDREN },
      { key: 'dispatch', label: 'Dispatch', Icon: MapPin, tint: '#ff0055', built: true, href: '/dispatch' },
      { key: 'tasks', label: 'Tasks', Icon: ListChecks, tint: '#f59e0b', built: false },
      { key: 'projects', label: 'Projects', Icon: Briefcase, tint: '#a855f7', built: false },
      { key: 'timesheets', label: 'Timesheets', Icon: Clock, tint: '#0ea5e9', built: false },
      { key: 'scheduling', label: 'Scheduling', Icon: CalendarDays, tint: '#8b5cf6', built: false }
    ]
  },
  {
    title: 'Asset Management',
    items: [
      { key: 'assets', label: 'Assets', Icon: Monitor, tint: '#d946ef', built: true, tab: 'rmm', sub: 'all-assets', children: ASSET_CHILDREN },
      { key: 'alerts', label: 'Alerts', Icon: Bell, tint: '#ef4444', built: true, tab: 'rmm', sub: 'critical' },
      { key: 'patches', label: 'Patches', Icon: ShieldCheck, tint: '#22c55e', built: true, tab: 'patching' },
      { key: 'scripts', label: 'Scripts & Automations', Icon: Code2, tint: '#10b981', built: true, tab: 'automations' },
      { key: 'netmon', label: 'Network Monitoring', Icon: Activity, tint: '#3b82f6', built: true, tab: 'network-map' },
      { key: 'remote', label: 'Remote Support', Icon: Headphones, tint: '#f59e0b', built: true, tab: 'remote-support' },
      { key: 'vault', label: 'Vault', Icon: KeyRound, tint: '#14b8a6', built: true, tab: 'vault' }
    ]
  },
  {
    title: 'MDM Management',
    items: [
      { key: 'mdm-summary', label: 'Overview', Icon: LayoutDashboard, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-summary' },
      { key: 'mdm-devices', label: 'Devices', Icon: Smartphone, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-devices' },
      { key: 'mdm-applications', label: 'Applications', Icon: AppWindow, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-applications' },
      { key: 'mdm-configurations', label: 'Configurations', Icon: SlidersHorizontal, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-configurations' },
      { key: 'mdm-files', label: 'Files', Icon: FolderOpen, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-files' },
      { key: 'mdm-settings', label: 'Settings', Icon: Settings, tint: '#d946ef', built: true, tab: 'mdm', sub: 'mdm-settings' }
    ]
  },
  {
    title: 'Client Management',
    items: [
      { key: 'clients', label: 'Clients', Icon: Store, tint: '#f59e0b', built: false },
      { key: 'sales-order', label: 'Sales Order', Icon: Package, tint: '#d946ef', built: false },
      { key: 'contracts', label: 'All Contracts', Icon: ScrollText, tint: '#10b981', built: false },
      { key: 'invoice-audit', label: 'Invoice Audit', Icon: BadgeCheck, tint: '#84cc16', built: false },
      { key: 'invoices', label: 'Invoices', Icon: Receipt, tint: '#22c55e', built: false },
      { key: 'quotes', label: 'Quotes', Icon: FileText, tint: '#a855f7', built: false },
      { key: 'sales-inbox', label: 'Sales Inbox', Icon: Inbox, tint: '#f43f5e', built: false }
    ]
  },
  {
    title: 'Documentation',
    items: [
      { key: 'it-docs', label: 'IT Documentation', Icon: FileCode, tint: '#3b82f6', built: false },
      { key: 'kb', label: 'Knowledge Base', Icon: BookOpen, tint: '#f59e0b', built: false, badge: 'New' }
    ]
  },
  {
    title: 'More',
    items: [
      { key: 'reports', label: 'Reports', Icon: BarChart3, tint: '#22c55e', built: false },
      { key: 'ai', label: 'Apex AI Lab', Icon: Bot, tint: '#0ea5e9', built: true, ai: true },
      { key: 'settings', label: 'Settings', Icon: Settings, tint: '#64748b', built: true, tab: 'settings' }
    ]
  }
];

const IconTile: React.FC<{ Icon: LucideIcon; tint: string; muted?: boolean }> = ({ Icon, tint, muted }) => (
  <span
    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
    style={{ background: muted ? '#e2e8f0' : `${tint}1f` }}
  >
    <Icon className="w-3.5 h-3.5" style={{ color: muted ? '#94a3b8' : tint }} />
  </span>
);

export const RoadmapNav: React.FC = () => {
  const {
    activeTab, setActiveTab, activeSubRailView, setActiveSubRailView,
    setIsAiDrawerOpen, devices, tickets
  } = useApp();

  const openCount = tickets.filter((t) => t.status === 'new' || t.status === 'in_progress').length;
  const counts: Record<string, number | undefined> = {
    assets: devices.length,
    tickets: openCount
  };

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ assets: false, tickets: false });
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  const isActive = (it: Item): boolean => {
    if (it.tab === 'mdm') return activeTab === 'mdm' && activeSubRailView === it.sub;
    if (it.sub && it.tab === 'rmm' && it.key !== 'assets' && it.key !== 'alerts') return activeTab === 'rmm' && activeSubRailView === it.sub;
    if (it.tab && !it.children) return activeTab === it.tab;
    return false;
  };

  const go = (it: Item) => {
    if (!it.built) return;
    if (it.href) {
      if (it.href.startsWith('/')) window.location.href = it.href;
      else window.open(it.href, '_blank', 'noopener');
      return;
    }
    if (it.ai) { setIsAiDrawerOpen(true); return; }
    if (it.children) { toggle(it.key); }
    if (it.tab) setActiveTab(it.tab);
    if (it.sub) setActiveSubRailView(it.sub);
  };

  const renderItem = (it: Item, child = false) => {
    const active = isActive(it);
    const hasKids = !!it.children?.length;
    const isOpen = expanded[it.key];
    const cnt = counts[it.key];
    return (
      <div key={it.key}>
        <button
          onClick={() => go(it)}
          disabled={!it.built}
          className={`w-full flex items-center gap-2 rounded-md text-xs transition ${child ? 'pl-8 pr-2.5 py-1.5' : 'px-2 py-1.5'} ${
            active
              ? 'bg-[#e9e9f5] text-slate-900 font-semibold'
              : it.built
                ? 'text-slate-700 hover:bg-slate-200/50 cursor-pointer'
                : 'text-slate-400 cursor-default'
          }`}
          title={it.built ? it.label : `${it.label} — coming soon`}
        >
          {!child && <IconTile Icon={it.Icon} tint={it.tint} muted={!it.built} />}
          {child && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-fuchsia-500' : 'bg-slate-300'}`} />}
          <span className="truncate flex-1 text-left">{it.label}</span>
          {it.badge && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded px-1 py-0.5">{it.badge}</span>}
          {!it.built && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 rounded px-1 py-0.5">Soon</span>}
          {typeof cnt === 'number' && it.built && <span className="text-[11px] text-slate-400 tabular-nums">{cnt}</span>}
          {hasKids && (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)}
        </button>
        {hasKids && isOpen && (
          <div className="mt-0.5 space-y-0.5">
            {it.children!.map((c) => renderItem(c, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3 custom-scrollbar">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map((it) => renderItem(it))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RoadmapNav;
