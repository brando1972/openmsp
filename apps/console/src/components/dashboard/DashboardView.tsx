import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  Sparkles,
  Layers,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Folder,
  User,
  ShieldCheck,
  Footprints,
  SlidersHorizontal,
  X,
  Laptop,
  HardDrive,
  Check,
  ChevronRight
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    devices,
    tickets,
    patches,
    selectedClientId,
    setActiveTab,
    openTab,
    setSelectedDeviceId,
    setSelectedTicketId,
    currentUser
  } = useApp();

  const [showWidgetLibrary, setShowWidgetLibrary] = useState(false);

  const filteredDevices = selectedClientId === 'all' 
    ? devices 
    : devices.filter(d => d.clientId === selectedClientId);
  
  const filteredTickets = selectedClientId === 'all'
    ? tickets
    : tickets.filter(t => t.clientId === selectedClientId);

  const myTicketsCount = filteredTickets.filter(t => t.assignedTech.includes('Rivera') || t.assignedTech.includes('Ray') || t.status === 'new').length;
  const criticalDevices = filteredDevices.filter(d => d.health === 'critical' || d.health === 'warning');

  // Simulated SuperOps alerts from live endpoints
  const alertsList = [
    {
      id: 'al-1',
      occurrences: 1,
      message: 'High CPU Usage (>85%)',
      assetName: filteredDevices[0]?.name || "Brandons-MacBook-Pro.local",
      assetId: filteredDevices[0]?.id || 'dev-1',
      description: 'Actual CPU usage exceeded 85% threshold continuously for 5 mins',
      createdTime: 'Today 14:59',
      clientName: filteredDevices[0]?.clientName || 'Richs'
    },
    {
      id: 'al-2',
      occurrences: 1,
      message: 'Service Spooler Stopped',
      assetName: filteredDevices[1]?.name || "Michael's Desktop",
      assetId: filteredDevices[1]?.id || 'dev-2',
      description: 'Print spooler service terminated unexpectedly',
      createdTime: 'Today 13:40',
      clientName: filteredDevices[1]?.clientName || 'Dunder Mifflin'
    },
    {
      id: 'al-3',
      occurrences: 2,
      message: 'Process Usage Alert',
      assetName: filteredDevices[2]?.name || "Winslow's Desktop",
      assetId: filteredDevices[2]?.id || 'dev-3',
      description: 'Excessive memory paging on main volume',
      createdTime: 'Yesterday 17:15',
      clientName: filteredDevices[2]?.clientName || 'Globex Corporation'
    },
    {
      id: 'al-4',
      occurrences: 1,
      message: 'Missing Critical OS Patch',
      assetName: filteredDevices[0]?.name || "Brandons-MacBook-Pro.local",
      assetId: filteredDevices[0]?.id || 'dev-1',
      description: 'macOS Security Update 2026-003 pending installation',
      createdTime: 'Sep 10, 2026',
      clientName: filteredDevices[0]?.clientName || 'Richs'
    }
  ];

  const handleOpenAsset = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    openTab({ type: 'rmm', title: 'Assets' });
  };

  const handleOpenTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    openTab({ type: 'psa-tickets', title: 'Tickets' });
  };

  return (
    <div className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 overflow-y-auto space-y-4 sm:space-y-6 custom-scrollbar bg-[#f4f6f8] text-[#1a1a24]">
      {/* Top Greeting Header (SuperOps style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Gradient Initial Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 text-white font-bold text-lg flex items-center justify-center shadow-sm shrink-0">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'B'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#212b36] flex items-center gap-1.5">
              <span>Good day, {currentUser?.name || 'Brandon Ray'}</span>
              <span>👋</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Last updated at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* SuperOps Dark Outline Button: Widget Library */}
        <button
          onClick={() => setShowWidgetLibrary(true)}
          className="self-start sm:self-auto bg-[#090113] hover:bg-black text-white text-xs font-semibold px-3.5 py-2 rounded-md transition shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Widget Library</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SuperOps 6-Card Horizontal KPI Row                                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* 1. My Tickets */}
        <div 
          onClick={() => openTab({ type: 'psa-tickets', title: 'Tickets' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#fde8e8] flex items-center justify-center text-[#9b1c1c] text-xs font-bold">
            🎩
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">{myTicketsCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">My Tickets</div>
          </div>
        </div>

        {/* 2. My Tickets Due Today */}
        <div 
          onClick={() => openTab({ type: 'psa-tickets', title: 'Tickets' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#fee2e2] flex items-center justify-center text-[#b91c1c] text-xs font-bold">
            ⏰
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">0</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">My Tickets Due Today</div>
          </div>
        </div>

        {/* 3. All Patches */}
        <div 
          onClick={() => openTab({ type: 'patching', title: 'Patch Management' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#dcfce7] flex items-center justify-center text-[#15803d] text-xs font-bold">
            🩹
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">{patches.length || 5}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">All Patches</div>
          </div>
        </div>

        {/* 4. Unassigned Tickets */}
        <div 
          onClick={() => openTab({ type: 'psa-tickets', title: 'Tickets' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#e0f2fe] flex items-center justify-center text-[#0369a1] text-xs font-bold">
            👤
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">0</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Unassigned Tickets</div>
          </div>
        </div>

        {/* 5. Endpoints */}
        <div 
          onClick={() => openTab({ type: 'rmm', title: 'Assets' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#f3e8ff] flex items-center justify-center text-[#7e22ce] text-xs font-bold">
            📁
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">{filteredDevices.length}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Endpoints</div>
          </div>
        </div>

        {/* 6. Tickets I'm Following */}
        <div 
          onClick={() => openTab({ type: 'psa-tickets', title: 'Tickets' })}
          className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between hover:shadow-md transition cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-[#ffedd5] flex items-center justify-center text-[#c2410c] text-xs font-bold">
            👣
          </div>
          <div className="mt-2 text-center">
            <div className="text-3xl font-bold text-[#212b36]">1</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Tickets I'm Following</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Widget Card 1: All Alerts (5/5) (Exact SuperOps layout)                   */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <h2 className="font-bold text-sm text-[#212b36]">All Alerts</h2>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {alertsList.length}/{alertsList.length}
          </span>
        </div>

        {/* Desktop Alerts Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#f9fafb] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 w-28">Occurrences</th>
                <th className="py-2.5 px-4">Message</th>
                <th className="py-2.5 px-4">Asset Name</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Created Time</th>
                <th className="py-2.5 px-4">Client Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alertsList.map((alert) => (
                <tr key={alert.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4">
                    <span className="inline-block bg-[#fef3c7] text-[#92400e] font-bold text-xs px-2 py-0.5 rounded">
                      {alert.occurrences}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">{alert.message}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleOpenAsset(alert.assetId)}
                      className="text-[#011fff] hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span>{alert.assetName}</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{alert.description}</td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{alert.createdTime}</td>
                  <td className="py-3 px-4 text-slate-600 font-medium">{alert.clientName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Alerts Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {alertsList.map((alert) => (
            <div key={alert.id} className="p-3.5 flex flex-col gap-1.5 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-900">{alert.message}</span>
                <span className="bg-[#fef3c7] text-[#92400e] font-bold text-[10px] px-2 py-0.5 rounded">
                  {alert.occurrences}x
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">{alert.description}</p>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <button
                  onClick={() => handleOpenAsset(alert.assetId)}
                  className="text-[#011fff] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Laptop className="w-3 h-3" />
                  <span>{alert.assetName}</span>
                </button>
                <span className="text-[10px]">{alert.clientName} • {alert.createdTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Widget Card 2: Endpoints (Exact SuperOps layout)                          */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs">
              <Folder className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-bold text-sm text-[#212b36]">Endpoints</h2>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {filteredDevices.length}/{filteredDevices.length}
            </span>
          </div>
          <button
            onClick={() => openTab({ type: 'rmm', title: 'Assets' })}
            className="text-xs text-[#011fff] font-semibold hover:underline"
          >
            View All Assets
          </button>
        </div>

        {/* Desktop Endpoints Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#f9fafb] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 w-24">Client Name</th>
                <th className="py-2.5 px-4">Site Name</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Serial Number</th>
                <th className="py-2.5 px-4">Manufacturer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDevices.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-3 px-4 font-medium text-slate-900">{d.clientName}</td>
                  <td className="py-3 px-4 text-slate-500">{d.siteName}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                        d.health !== 'offline'
                          ? 'bg-[#c8e6c5] text-[#1c4419]'
                          : 'bg-[#ececec] text-[#444444]'
                      }`}
                    >
                      {d.health !== 'offline' ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    <button
                      onClick={() => handleOpenAsset(d.id)}
                      className="text-[#011fff] hover:underline"
                    >
                      {d.name}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                    {d.serialNumber || 'K4R17CLX2R'}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {d.os === 'macos' ? 'Apple Inc.' : 'Dell Inc.'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Endpoints Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredDevices.map((d) => (
            <div
              key={d.id}
              onClick={() => handleOpenAsset(d.id)}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#011fff]">{d.name}</div>
                  <div className="text-[10px] text-slate-500">{d.clientName} • {d.os.toUpperCase()}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    d.health !== 'offline' ? 'bg-[#c8e6c5] text-[#1c4419]' : 'bg-[#ececec] text-[#444444]'
                  }`}
                >
                  {d.health !== 'offline' ? 'ONLINE' : 'OFFLINE'}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SuperOps Widget Library Slide-Over Sheet (Right Drawer)                   */}
      {/* ========================================================================= */}
      {showWidgetLibrary && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
          <div className="w-80 bg-white h-full shadow-2xl flex flex-col animate-fadeIn">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Widget Library</h3>
              <button
                onClick={() => setShowWidgetLibrary(false)}
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Default Report Views
                </div>
                {[
                  { label: "My Tickets Due Today", icon: "⏱", active: true },
                  { label: "Tickets I'm Following", icon: "👣", active: true },
                  { label: "Tickets waiting for approval", icon: "🎟️", active: false },
                  { label: "Open Tickets", icon: "🎟️", active: true },
                  { label: "Critical Fleet Alerts", icon: "🚨", active: true },
                  { label: "Patch Compliance Gauge", icon: "🩹", active: true }
                ].map((w, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span>{w.icon}</span>
                      <span className="font-medium text-slate-800">{w.label}</span>
                    </div>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                      w.active ? 'bg-[#090113] border-[#090113] text-white' : 'border-slate-300'
                    }`}>
                      {w.active && <Check className="w-3 h-3" />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

