import React from 'react';
import { useApp } from '../../data/AppContext';
import { 
  Layers, 
  Calendar, 
  Filter, 
  Truck, 
  Building2, 
  MapPin, 
  Fuel, 
  Package, 
  Radio, 
  Flame,
  CheckSquare,
  Square,
  Home,
  Tractor,
  UserCheck
} from 'lucide-react';

export interface MapLayerState {
  showAll: boolean;
  workOrders: boolean;
  facilities: boolean;
  jobSites: boolean;
  office: boolean;
  equipment: boolean;
  fuel: boolean;
  technicians: boolean;
  nurseries: boolean;
  traffic: boolean;
  density: boolean;
  showCarryOver: boolean;
}

interface MapFilterSidebarProps {
  layers: MapLayerState;
  setLayers: React.Dispatch<React.SetStateAction<MapLayerState>>;
  selectedTechnician: string;
  setSelectedTechnician: (tech: string) => void;
  selectedPropertyType: string;
  setSelectedPropertyType: (type: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (c: boolean) => void;
}

export const MapFilterSidebar: React.FC<MapFilterSidebarProps> = ({
  layers,
  setLayers,
  selectedTechnician,
  setSelectedTechnician,
  selectedPropertyType,
  setSelectedPropertyType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  isCollapsed,
  setIsCollapsed
}) => {
  const { technicians, equipment } = useApp();

  const handleToggleLayer = (key: keyof MapLayerState) => {
    if (key === 'showAll') {
      const nextVal = !layers.showAll;
      setLayers({
        showAll: nextVal,
        workOrders: nextVal,
        facilities: nextVal,
        jobSites: nextVal,
        office: nextVal,
        equipment: nextVal,
        fuel: nextVal,
        technicians: nextVal,
        nurseries: nextVal,
        traffic: nextVal,
        density: nextVal,
        showCarryOver: layers.showCarryOver
      });
    } else {
      setLayers(prev => ({
        ...prev,
        [key]: !prev[key]
      }));
    }
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="absolute top-4 left-4 z-20 bg-white/95 text-slate-800 p-2.5 rounded-lg shadow-xl border border-slate-300 hover:bg-slate-50 transition flex items-center space-x-1 font-bold text-xs"
      >
        <Layers className="w-4 h-4 text-emerald-600" />
        <span>Open Filters</span>
      </button>
    );
  }

  return (
    <div className="w-80 bg-slate-100/95 backdrop-blur border-r border-slate-300 h-full overflow-y-auto flex flex-col z-20 text-xs text-slate-800 shadow-xl select-none">
      {/* Sidebar Header */}
      <div className="bg-slate-200 p-2.5 border-b border-slate-300 flex items-center justify-between">
        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
          <span className="px-2 py-1 bg-white border border-slate-300 rounded text-[11px]">GIS Layers</span>
          <span className="px-2 py-1 text-slate-600 text-[11px]">Properties</span>
          <span className="px-2 py-1 text-slate-600 text-[11px]">Routes</span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-slate-500 hover:text-slate-900 font-bold px-1.5 py-0.5 rounded hover:bg-slate-300 text-xs"
          title="Collapse filter panel"
        >
          &lt;&lt;
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* LAYERS CHECKBOX SECTION */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-2">
            <span className="font-extrabold uppercase text-slate-700 text-[11px]">GIS Map Layers:</span>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center space-x-2 font-bold cursor-pointer hover:text-emerald-700">
              <input
                type="checkbox"
                checked={layers.showAll}
                onChange={() => handleToggleLayer('showAll')}
                className="w-3.5 h-3.5 rounded text-emerald-600"
              />
              <span>Show All Map Layers</span>
            </label>

            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 pt-1">
              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.workOrders}
                  onChange={() => handleToggleLayer('workOrders')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Work Orders</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.jobSites}
                  onChange={() => handleToggleLayer('jobSites')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Job Sites</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.technicians}
                  onChange={() => handleToggleLayer('technicians')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Technicians GPS</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.equipment}
                  onChange={() => handleToggleLayer('equipment')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Equipment & Fleet</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.facilities}
                  onChange={() => handleToggleLayer('facilities')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>HQ & Shops</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.nurseries}
                  onChange={() => handleToggleLayer('nurseries')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Nurseries & Mulch</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.fuel}
                  onChange={() => handleToggleLayer('fuel')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Fleet Fuel</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer hover:text-emerald-700">
                <input
                  type="checkbox"
                  checked={layers.traffic}
                  onChange={() => handleToggleLayer('traffic')}
                  className="w-3.5 h-3.5 rounded text-emerald-600"
                />
                <span>Traffic</span>
              </label>
            </div>
          </div>
        </div>

        {/* WORK ORDERS DATE FILTER */}
        <div className="bg-slate-200/80 p-2.5 rounded-lg border border-slate-300 space-y-2">
          <span className="font-extrabold uppercase text-slate-700 text-[11px] block">Schedule Range:</span>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Active Date:</span>
              <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 font-mono">
                Aug 28, 2026
              </span>
            </div>
            <label className="flex items-center space-x-2 pt-1 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={layers.showCarryOver}
                onChange={() => handleToggleLayer('showCarryOver')}
                className="w-3.5 h-3.5 rounded text-emerald-600"
              />
              <span>Show multi-day carryover</span>
            </label>
          </div>
        </div>

        {/* PROPERTY TYPE FILTER (Residential vs Commercial) */}
        <div>
          <label className="font-bold text-slate-700 text-[11px] block mb-1">Property Type:</label>
          <select
            value={selectedPropertyType}
            onChange={(e) => setSelectedPropertyType(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Properties (Residential + Commercial)</option>
            <option value="Residential">Residential Cut Sites Only</option>
            <option value="Commercial">Commercial / HOA Sites Only</option>
          </select>
        </div>

        {/* TECHNICIANS SELECTION FILTER */}
        <div>
          <label className="font-bold text-slate-700 text-[11px] block mb-1 flex items-center">
            <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Technician Route:
          </label>
          <select
            value={selectedTechnician}
            onChange={(e) => setSelectedTechnician(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Active Technicians</option>
            {technicians.map(t => (
              <option key={t.id} value={t.name}>{t.name} ({t.role})</option>
            ))}
            <option value="Unassigned">Unassigned Stops</option>
          </select>
        </div>
      </div>

      {/* Footer Auto-Refresh */}
      <div className="mt-auto p-3 bg-slate-200 border-t border-slate-300 flex items-center justify-between text-[11px] text-slate-600">
        <label className="flex items-center space-x-1.5 cursor-pointer">
          <input type="checkbox" defaultChecked className="w-3 h-3 rounded text-emerald-600" />
          <span>Auto GPS Sync</span>
        </label>
        <span className="font-mono text-[10px] text-slate-400">GIS v3.9</span>
      </div>
    </div>
  );
};
