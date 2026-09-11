import React from 'react';
import { useApp } from '../../data/AppContext';
import { 
  Search,
  Sparkles,
  Building2, 
  Radio,
  UserCheck
} from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { 
    clients,
    selectedClientId,
    setSelectedClientId,
    setIsCommandPaletteOpen,
    setIsAiDrawerOpen,
  } = useApp();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-30 shrink-0">
      {/* Left: Client Tenant Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-slate-400 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium">
          <Building2 className="w-4 h-4 text-sky-400" />
          <span>Client Scope:</span>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="bg-transparent text-slate-100 font-bold outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900 text-slate-100">All MSP Clients (135 Endpoints)</option>
            {clients.map(c => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                {c.name} ({c.totalDevices} Devices)
              </option>
            ))}
          </select>
        </div>

        {/* Relay Server Quick Status */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>RustDesk Relay: Online</span>
        </div>
      </div>

      {/* Center: Command Search Bar */}
      <div className="flex-1 max-w-md mx-6">
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-slate-400 px-4 py-2 rounded-xl text-xs transition"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-500" />
            <span>Search endpoints, tickets, passwords, KB...</span>
          </div>
          <kbd className="px-2 py-0.5 text-[10px] bg-slate-800 border border-slate-700 text-slate-300 rounded font-mono font-bold">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* Right: Quick Tools & Tech Profile */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition relative"
          title="Apex AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-sky-400 rounded-full animate-ping" />
        </button>

        <div className="h-6 w-px bg-slate-800" />

        {/* Technician Profile */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-sky-400/30">
            AR
          </div>
          <div className="hidden sm:block text-left text-xs">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>Alex Rivera</span>
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Lead MSP Architect</div>
          </div>
        </div>
      </div>
    </header>
  );
};
