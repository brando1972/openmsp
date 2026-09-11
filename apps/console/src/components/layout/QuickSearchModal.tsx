import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  Search,
  Monitor,
  TicketCheck,
  KeyRound,
  X,
  ArrowRight
} from 'lucide-react';

export const QuickSearchModal: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    devices,
    tickets,
    vaultItems,
    setSelectedDeviceId,
    setSelectedTicketId,
    setActiveTab
  } = useApp();

  const [query, setQuery] = useState('');

  if (!isCommandPaletteOpen) return null;

  const filteredDevices = devices.filter(d =>
    d.name.toLowerCase().includes(query.toLowerCase()) ||
    d.hostname.toLowerCase().includes(query.toLowerCase()) ||
    d.clientName.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTickets = tickets.filter(t =>
    t.ticketNumber.toLowerCase().includes(query.toLowerCase()) ||
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.clientName.toLowerCase().includes(query.toLowerCase())
  );

  const filteredVault = vaultItems.filter(v =>
    v.title.toLowerCase().includes(query.toLowerCase()) ||
    v.clientName.toLowerCase().includes(query.toLowerCase()) ||
    (v.username && v.username.toLowerCase().includes(query.toLowerCase()))
  );

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    setActiveTab('rmm');
    setIsCommandPaletteOpen(false);
  };

  const handleSelectTicket = (id: string) => {
    setSelectedTicketId(id);
    setActiveTab('psa-tickets');
    setIsCommandPaletteOpen(false);
  };

  const handleSelectVault = () => {
    setActiveTab('vault');
    setIsCommandPaletteOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/50">
          <Search className="w-5 h-5 text-sky-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across endpoints, tickets, and passwords..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 font-medium text-sm outline-none"
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto space-y-6 custom-scrollbar text-xs">
          {/* Managed Endpoints */}
          {filteredDevices.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Monitor className="w-3.5 h-3.5 text-sky-400" />
                <span>Managed Endpoints ({filteredDevices.length})</span>
              </div>
              <div className="space-y-1">
                {filteredDevices.slice(0, 4).map(device => (
                  <button
                    key={device.id}
                    onClick={() => handleSelectDevice(device.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-left transition group"
                  >
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-sky-400 transition">{device.name}</div>
                      <div className="text-[11px] text-slate-400">{device.clientName} • {device.osVersion}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PSA Tickets */}
          {filteredTickets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-400 uppercase tracking-wider mb-2">
                <TicketCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>PSA Tickets ({filteredTickets.length})</span>
              </div>
              <div className="space-y-1">
                {filteredTickets.slice(0, 4).map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-left transition group"
                  >
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-amber-400 transition">
                        [{ticket.ticketNumber}] {ticket.title}
                      </div>
                      <div className="text-[11px] text-slate-400">{ticket.clientName} • Assigned: {ticket.assignedTech}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bitwarden Vault */}
          {filteredVault.length > 0 && (
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-400 uppercase tracking-wider mb-2">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bitwarden Vault Credentials ({filteredVault.length})</span>
              </div>
              <div className="space-y-1">
                {filteredVault.slice(0, 4).map(item => (
                  <button
                    key={item.id}
                    onClick={handleSelectVault}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-left transition group"
                  >
                    <div>
                      <div className="font-bold text-slate-200 group-hover:text-emerald-400 transition">{item.title}</div>
                      <div className="text-[11px] text-slate-400">{item.clientName} • Username: {item.username || 'N/A'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredDevices.length === 0 && filteredTickets.length === 0 && filteredVault.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              No matching endpoints, tickets, or credentials found for "{query}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
