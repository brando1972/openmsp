import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, CheckCircle2, AlertTriangle, Clock, UserCheck } from 'lucide-react';

interface DateControlBarProps {
  selectedTechnician: string;
  setSelectedTechnician: (techId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const DateControlBar: React.FC<DateControlBarProps> = ({
  selectedTechnician,
  setSelectedTechnician,
  searchQuery,
  setSearchQuery
}) => {
  const { currentDate, setCurrentDate, workOrders, technicians } = useApp();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatDateDisplay = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const handlePrevDay = () => {
    try {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d.toISOString().split('T')[0]);
    } catch {
      setCurrentDate('2026-08-27');
    }
  };

  const handleNextDay = () => {
    try {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d.toISOString().split('T')[0]);
    } catch {
      setCurrentDate('2026-08-29');
    }
  };

  const todaysOrders = workOrders.filter(wo => wo.date === currentDate || !wo.date);
  const completedCount = todaysOrders.filter(wo => wo.flags.isCompleted || wo.status === 'completed').length;
  const alertCount = todaysOrders.filter(wo => wo.status === 'urgent' || wo.status === 'attention' || wo.flags.hasHazard).length;

  return (
    <div className="bg-slate-200/90 backdrop-blur border-b border-slate-300 px-3 sm:px-4 py-2 shadow-sm">
      <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2">
        {/* Left Side: Date Pager & Quick Metrics */}
        <div className="flex items-center justify-between sm:justify-start space-x-2">
          <div className="inline-flex items-center bg-white rounded-lg border border-slate-300 shadow-sm p-0.5">
            <button
              onClick={handlePrevDay}
              className="p-1 hover:bg-slate-100 text-slate-700 rounded transition"
              title="Previous Day"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div className="px-2 sm:px-3 py-1 font-bold text-slate-800 text-xs sm:text-sm tracking-wide select-none min-w-[105px] text-center font-mono">
              {formatDateDisplay(currentDate)}
            </div>

            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="p-1 hover:bg-slate-100 text-emerald-600 rounded transition border-l border-r border-slate-200"
              title="Select Calendar Date"
            >
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
            </button>

            <button
              onClick={handleNextDay}
              className="p-1 hover:bg-slate-100 text-slate-700 rounded transition"
              title="Next Day"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {showDatePicker && (
            <div className="relative">
              <input
                type="date"
                value={currentDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setCurrentDate(e.target.value);
                    setShowDatePicker(false);
                  }
                }}
                className="bg-white border-2 border-emerald-500 rounded px-2 py-1 text-xs shadow-xl font-medium focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {/* Quick Metrics */}
          <div className="flex items-center space-x-1.5 text-[11px]">
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-white border border-slate-300 font-semibold text-slate-700 shadow-xs">
              <Clock className="w-3 h-3 text-blue-500 mr-1" />
              {todaysOrders.length} Stops
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-50 border border-emerald-300 font-semibold text-emerald-800 shadow-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 mr-1" />
              {completedCount} Done
            </span>
            {alertCount > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-50 border border-amber-300 font-semibold text-amber-900 shadow-xs">
                <AlertTriangle className="w-3 h-3 text-amber-600 mr-1" />
                {alertCount}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Technician Filters & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Technician Filter: native select on mobile, pill strip on tablet+ */}
          <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-300 shadow-xs text-xs flex-1 sm:flex-initial">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600 ml-1 flex-shrink-0" />
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="bg-transparent font-bold text-slate-700 text-xs focus:outline-none pr-2 py-0.5 cursor-pointer"
            >
              <option value="ALL">All Technicians</option>
              {technicians.map(t => (
                <option key={t.id} value={t.name}>{t.name} ({t.role.split(' ')[0]})</option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search site, address, client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-6 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
