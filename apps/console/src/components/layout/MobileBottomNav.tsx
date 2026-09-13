import React from 'react';
import { useApp } from '../../data/AppContext';
import {
  LayoutDashboard,
  Layers,
  Ticket,
  Radio,
  Menu
} from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    openTab,
    tickets,
    devices,
    rustDeskConfig,
    setIsMobileMenuOpen
  } = useApp();

  const openTicketsCount = tickets.filter(t => t.status === 'new' || t.status === 'in_progress').length;
  const onlineDevicesCount = devices.filter(d => d.health !== 'offline').length;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-t border-slate-200 z-40 px-3 flex items-center justify-around shadow-lg select-none pb-safe">
      {/* Home */}
      <button
        onClick={() => {
          setActiveTab('dashboard');
          openTab({ type: 'dashboard', title: 'Home' });
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
          activeTab === 'dashboard' ? 'text-[#ff0055] font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Home</span>
      </button>

      {/* Assets / Endpoints */}
      <button
        onClick={() => {
          setActiveTab('rmm');
          openTab({ type: 'rmm', title: 'Assets' });
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer relative ${
          activeTab === 'rmm' ? 'text-[#ff0055] font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className="relative">
          <Layers className="w-5 h-5 mb-0.5" />
          {onlineDevicesCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center">
              {onlineDevicesCount}
            </span>
          )}
        </div>
        <span className="text-[10px]">Assets</span>
      </button>

      {/* Tickets */}
      <button
        onClick={() => {
          setActiveTab('psa-tickets');
          openTab({ type: 'psa-tickets', title: 'Tickets' });
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer relative ${
          activeTab === 'psa-tickets' ? 'text-[#ff0055] font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className="relative">
          <Ticket className="w-5 h-5 mb-0.5" />
          {openTicketsCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-[#ff0055] text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center">
              {openTicketsCount}
            </span>
          )}
        </div>
        <span className="text-[10px]">Tickets</span>
      </button>

      {/* Remote Support */}
      <button
        onClick={() => {
          setActiveTab('remote-support');
          openTab({ type: 'remote-support', title: 'Remote Support' });
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer relative ${
          activeTab === 'remote-support' ? 'text-[#ff0055] font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className="relative">
          <Radio className={`w-5 h-5 mb-0.5 ${rustDeskConfig.onlineState ? 'text-emerald-600' : ''}`} />
          <span className={`absolute -top-0.5 -right-1 w-2 h-2 rounded-full ${rustDeskConfig.onlineState ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        </div>
        <span className="text-[10px]">Remote</span>
      </button>

      {/* Menu / Drawer */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="flex flex-col items-center justify-center flex-1 py-1 text-slate-500 hover:text-slate-800 transition cursor-pointer"
      >
        <Menu className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Menu</span>
      </button>
    </nav>
  );
};
