import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { WorkOrder } from '../../types';
import { DispatchRow } from './DispatchRow';
import { DateControlBar } from '../layout/DateControlBar';
import { QuickInspectModal } from './QuickInspectModal';
import { DispatchRouteOptimizerModal } from './DispatchRouteOptimizerModal';
import {
  ArrowUpDown,
  Download,
  Printer,
  HelpCircle,
  Plus,
  Sprout,
  Building2,
  Home,
  Navigation,
  CheckCircle2,
  Eye,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  DollarSign,
  UserCheck
} from 'lucide-react';

export const DispatchGrid: React.FC = () => {
  const { workOrders, currentDate, openWorkOrderModal, updateWorkOrder, deleteWorkOrder, setQuickInspectWO, technicians } = useApp();
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  const [propertyFilter, setPropertyFilter] = useState<'ALL' | 'Residential' | 'Commercial'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLegend, setShowLegend] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'seq' | 'status' | 'customer' | 'property'>('seq');
  const [showAllDates, setShowAllDates] = useState<boolean>(false);
  const [hideFinished, setHideFinished] = useState<boolean>(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showRouteOptimizer, setShowRouteOptimizer] = useState(false);

  const filteredOrders = workOrders.filter(wo => {
    const woDate = (wo.date || '').trim();
    const dispDate = (currentDate || '').trim();
    const matchesDate = showAllDates || !woDate || woDate === dispDate;

    const matchesTech = selectedTechnician === 'ALL'
      ? true
      : selectedTechnician === 'Unassigned'
        ? (!wo.technicianName || wo.technicianName === 'Unassigned')
        : wo.technicianName === selectedTechnician;

    const matchesProperty = propertyFilter === 'ALL' || wo.propertyType === propertyFilter;
    const matchesFinished = !hideFinished || (wo.status !== 'completed' && !wo.flags.isCompleted);

    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      wo.customerName.toLowerCase().includes(q) ||
      wo.jobAddress.toLowerCase().includes(q) ||
      wo.woNumber.toLowerCase().includes(q) ||
      (wo.jobName && wo.jobName.toLowerCase().includes(q)) ||
      (wo.serviceTypeName && wo.serviceTypeName.toLowerCase().includes(q)) ||
      (wo.assetType && wo.assetType.toLowerCase().includes(q));

    return matchesDate && matchesTech && matchesProperty && matchesFinished && matchesSearch;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'seq') return (a.sequenceNum || 999) - (b.sequenceNum || 999);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    if (sortBy === 'property') return (a.propertyType || '').localeCompare(b.propertyType || '');
    return a.customerName.localeCompare(b.customerName);
  });

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(targetId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const draggedId = e.dataTransfer.getData('woId');
    if (!draggedId || draggedId === targetId) return;

    const currentList = [...sortedOrders];
    const fromIdx = currentList.findIndex(w => w.id === draggedId);
    const toIdx = currentList.findIndex(w => w.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...currentList];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    reordered.forEach((wo, i) => {
      updateWorkOrder({ ...wo, sequenceNum: (i + 1) * 10 });
    });
  };

  const handleApplyRoute = (reordered: WorkOrder[]) => {
    reordered.forEach((wo, i) => {
      updateWorkOrder({ ...wo, sequenceNum: (i + 1) * 10 });
    });
    setShowRouteOptimizer(false);
  };

  const handlePrintSheet = () => window.print();

  const handleExportCSV = () => {
    const headers = ["WO Number", "Status", "Technician", "Seq #", "Type", "Customer", "Job Site", "Address", "Turf SqFt", "Service", "Asset", "Balance"];
    const rows = sortedOrders.map(wo => [
      wo.woNumber, wo.status, wo.technicianName || 'Unassigned', wo.sequenceNum || '',
      wo.propertyType || 'Residential', `"${wo.customerName}"`, `"${wo.jobName || ''}"`,
      `"${wo.jobAddress}, ${wo.jobCity}"`, wo.turfSqFt || '',
      `"${wo.serviceTypeName || ''}"`, `"${wo.assetType || ''}"`, wo.balanceDue || 0
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `routes_${currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const STATUS_BORDER_MAP: Record<string, string> = {
    urgent: 'border-l-4 border-l-fuchsia-600 bg-fuchsia-50/60',
    active: 'border-l-4 border-l-emerald-600 bg-emerald-50/60',
    scheduled: 'border-l-4 border-l-cyan-500 bg-cyan-50/60',
    attention: 'border-l-4 border-l-orange-500 bg-orange-50/60',
    completed: 'border-l-4 border-l-slate-400 bg-slate-50 opacity-75'
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 w-full overflow-hidden">
      <DateControlBar
        selectedTechnician={selectedTechnician}
        setSelectedTechnician={setSelectedTechnician}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Dispatch Action Toolbar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-1">
          <span className="font-extrabold text-xs sm:text-sm text-slate-800 tracking-tight flex items-center">
            <Sprout className="w-4 h-4 mr-1 text-emerald-600" />
            <span className="hidden xs:inline">Route Board</span>
          </span>
          <span className="text-xs px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-600">
            {sortedOrders.length} Stops
          </span>

          {/* Show All Dates toggle */}
          <button
            onClick={() => setShowAllDates(!showAllDates)}
            className={`text-xs px-2 py-1 rounded-lg font-bold border transition ${
              showAllDates
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-amber-50'
            }`}
          >
            {showAllDates ? '📅 All Dates' : '📅 Today'}
          </button>

          {/* Hide Finished toggle */}
          <button
            onClick={() => setHideFinished(!hideFinished)}
            className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-lg font-bold border transition ${
              hideFinished
                ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-emerald-50'
            }`}
          >
            <span>{hideFinished ? '✓' : '○'}</span>
            <span>Hide Done</span>
          </button>

          {/* Route Optimizer button */}
          <button
            onClick={() => setShowRouteOptimizer(true)}
            disabled={sortedOrders.length === 0}
            className="flex items-center space-x-1 text-xs px-2.5 py-1 rounded-lg font-bold border bg-slate-900 text-white border-slate-700 hover:bg-amber-700 transition shadow-sm disabled:opacity-40"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Route Optimizer</span>
            <span className="sm:hidden">Optimize</span>
          </button>

          {/* Property Type Filter */}
          <div className="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button onClick={() => setPropertyFilter('ALL')} className={`px-2 py-0.5 rounded font-semibold transition ${propertyFilter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-600'}`}>All</button>
            <button onClick={() => setPropertyFilter('Residential')} className={`px-1.5 py-0.5 rounded font-semibold transition flex items-center space-x-0.5 ${propertyFilter === 'Residential' ? 'bg-emerald-700 text-white font-bold' : 'text-slate-600'}`}>
              <Home className="w-3 h-3" />
            </button>
            <button onClick={() => setPropertyFilter('Commercial')} className={`px-1.5 py-0.5 rounded font-semibold transition flex items-center space-x-0.5 ${propertyFilter === 'Commercial' ? 'bg-blue-700 text-white font-bold' : 'text-slate-600'}`}>
              <Building2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-xs">
          <div className="hidden sm:flex items-center space-x-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none">
              <option value="seq">Sequence #</option>
              <option value="status">Status</option>
              <option value="property">Site Type</option>
              <option value="customer">Customer</option>
            </select>
          </div>
          <button onClick={handleExportCSV} className="hidden md:flex items-center space-x-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-2 py-1 rounded font-medium transition" title="Export route sheet as CSV">
            <Download className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={handlePrintSheet} className="hidden md:flex items-center space-x-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-2 py-1 rounded font-medium transition" title="Print technician manifest">
            <Printer className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={() => openWorkOrderModal(null)} className="flex items-center space-x-1 bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded font-bold transition shadow-xs">
            <Plus className="w-3.5 h-3.5" /><span>New WO</span>
          </button>
        </div>
      </div>

      {/* Main Container: Mobile Card View on phones (<md), Table on tablet/desktop (md+) */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-2 sm:p-0">
        {/* ── MOBILE CARDS VIEW (<md) ── */}
        <div className="md:hidden space-y-2 pb-10">
          {sortedOrders.length > 0 ? (
            sortedOrders.map((wo, idx) => (
              <div 
                key={wo.id} 
                className={`bg-white rounded-xl p-3 shadow-xs border border-slate-200 ${STATUS_BORDER_MAP[wo.status] || ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                      #{wo.sequenceNum || idx + 1}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">{wo.woNumber}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${wo.propertyType === 'Commercial' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {wo.propertyType === 'Commercial' ? '🏢 Com' : '🏡 Res'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono font-bold text-xs ${wo.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      ${wo.balanceDue?.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-1.5">
                  <h4 className="font-black text-slate-900 text-xs">{wo.customerName}</h4>
                  <p className="text-slate-500 text-[11px] flex items-center mt-0.5">
                    <MapPin className="w-3 h-3 text-red-400 mr-1 flex-shrink-0" />
                    <span className="truncate">{wo.jobAddress}</span>
                  </p>
                  <p className="text-amber-800 font-semibold text-[11px] mt-0.5">
                    {wo.serviceTypeName || wo.jobName}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                  {/* Tech selector */}
                  <div className="flex items-center space-x-1">
                    <UserCheck className="w-3 h-3 text-emerald-600" />
                    <select
                      value={wo.technicianName || ''}
                      onChange={(e) => updateWorkOrder({ ...wo, technicianName: e.target.value })}
                      className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                    >
                      <option value="">-- Tech --</option>
                      {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                      <option value="Unassigned">Unassigned</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setQuickInspectWO(wo)}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300"
                      title="Quick Inspect"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openWorkOrderModal(wo)}
                      className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-300 font-bold text-[10px] flex items-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400">
              <Sprout className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-xs">No work orders for this filter.</p>
            </div>
          )}
        </div>

        {/* ── DESKTOP TABLE VIEW (md+) ── */}
        <table className="hidden md:table w-full text-left border-collapse min-w-[950px]">
          <thead className="bg-slate-200 text-slate-700 text-xs uppercase tracking-wider font-extrabold border-b-2 border-slate-300 sticky top-0 z-10 shadow-xs">
            <tr>
              <th className="py-2.5 px-1 w-6 text-center" title="Drag to reorder">⠿</th>
              <th className="py-2.5 px-2 text-center w-10">WO#</th>
              <th className="py-2.5 px-2 w-36">Technician</th>
              <th className="py-2.5 px-2 text-center w-16">Seq #</th>
              <th className="py-2.5 px-2 text-center w-12">View</th>
              <th className="py-2.5 px-2 text-center w-12">Notes</th>
              <th className="py-2.5 px-3 w-56">Flags</th>
              <th className="py-2.5 px-3">Customer & Job Site</th>
              <th className="py-2.5 px-3">Service & Requirements</th>
              <th className="py-2.5 px-3 text-right">Balance / Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80">
            {sortedOrders.length > 0 ? (
              sortedOrders.map((wo, idx) => (
                <tr
                  key={wo.id}
                  onDragOver={(e) => handleDragOver(e, wo.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDrop(e, wo.id)}
                  className={dragOverId === wo.id ? 'outline outline-2 outline-amber-500 outline-offset-[-2px]' : ''}
                >
                  <td colSpan={10} className="p-0">
                    <table className="w-full border-collapse">
                      <tbody>
                        <DispatchRow key={wo.id} workOrder={wo} index={idx} />
                      </tbody>
                    </table>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Sprout className="w-8 h-8 text-slate-300" />
                    <p className="font-semibold text-sm">No work orders found for this filter.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Inspect Slideover */}
      <QuickInspectModal />

      {/* Route Optimizer Modal */}
      <DispatchRouteOptimizerModal
        open={showRouteOptimizer}
        onClose={() => setShowRouteOptimizer(false)}
        orders={sortedOrders}
        onApply={handleApplyRoute}
      />
    </div>
  );
};
