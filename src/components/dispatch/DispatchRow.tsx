import React from 'react';
import { useApp } from '../../data/AppContext';
import { WorkOrder } from '../../types';
import { 
  Eye, 
  FileText, 
  AlertTriangle, 
  Edit, 
  Truck, 
  Package, 
  User, 
  Check, 
  ChevronRight,
  MoreVertical,
  Trash2,
  MapPin,
  Building2,
  Home
} from 'lucide-react';

interface DispatchRowProps {
  workOrder: WorkOrder;
  index: number;
}

export const DispatchRow: React.FC<DispatchRowProps> = ({ workOrder, index }) => {
  const { 
    technicians, 
    updateWorkOrder, 
    deleteWorkOrder, 
    openWorkOrderModal, 
    setQuickInspectWO 
  } = useApp();

  const wo = workOrder;

  const getRowBgClass = () => {
    switch (wo.status) {
      case 'urgent':
        return 'bg-[#c026d3] text-white border-fuchsia-400 hover:bg-[#a21caf]';
      case 'active':
        return 'bg-[#16a34a] text-white border-emerald-400 hover:bg-[#15803d]';
      case 'scheduled':
        return 'bg-[#06b6d4] text-white border-cyan-300 hover:bg-[#0891b2]';
      case 'attention':
        return 'bg-[#ea580c] text-white border-orange-400 hover:bg-[#c2410c]';
      case 'completed':
        return 'bg-emerald-50 text-slate-900 border-emerald-300 hover:bg-emerald-100/80';
      default:
        return 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50';
    }
  };

  const isDarkRow = wo.status === 'urgent' || wo.status === 'active' || wo.status === 'scheduled' || wo.status === 'attention';

  const handleTechChange = (newTechName: string) => {
    const matchedTech = technicians.find(t => t.name === newTechName);
    const updated: WorkOrder = {
      ...wo,
      technicianName: newTechName,
      technicianId: matchedTech ? matchedTech.id : '',
      flags: {
        ...wo.flags,
        hasDriver: !!newTechName && newTechName !== 'Unassigned'
      },
      journalLogs: [
        {
          id: `j-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          author: 'Dispatcher',
          message: `Reassigned technician to ${newTechName || 'Unassigned'}`,
          type: 'status'
        },
        ...wo.journalLogs
      ]
    };
    updateWorkOrder(updated);
  };

  const handleSequenceChange = (newSeq: string) => {
    const num = parseInt(newSeq) || 0;
    updateWorkOrder({
      ...wo,
      sequenceNum: num
    });
  };

  const handleToggleNested = () => {
    updateWorkOrder({
      ...wo,
      flags: {
        ...wo.flags,
        isNested: !wo.flags.isNested
      }
    });
  };

  return (
    <tr
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('woId', wo.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`border-b transition-colors text-xs font-medium cursor-grab active:opacity-60 ${getRowBgClass()}`}
    >
      {/* Drag Handle */}
      <td className="py-2 px-1 w-6 text-center select-none">
        <span className={`text-lg leading-none font-black tracking-tighter ${isDarkRow ? 'text-white/50' : 'text-slate-300'}`} title="Drag to reorder">⠿</span>
      </td>

      {/* 1. Lng / Sequence indicator */}
      <td className="py-2 px-2 text-center w-10 select-none">
        <div className="flex items-center justify-center">
          <span className={`font-mono text-[11px] font-bold ${isDarkRow ? 'text-white/80' : 'text-slate-500'}`}>
            {wo.woNumber.replace('WO-', '')}
          </span>
        </div>
      </td>

      {/* 2. Technician Selector */}
      <td className="py-2 px-2 w-36">
        <div className="relative">
          <select
            value={wo.technicianName || ''}
            onChange={(e) => handleTechChange(e.target.value)}
            className={`w-full appearance-none rounded-md px-2.5 py-1 text-xs font-bold border transition focus:outline-none shadow-sm ${
              isDarkRow
                ? 'bg-white/90 text-slate-900 border-white/60 focus:bg-white'
                : 'bg-white text-slate-800 border-slate-300 focus:border-emerald-500'
            }`}
          >
            <option value="">-- Technician --</option>
            {technicians.map(t => (
              <option key={t.id} value={t.name} className="text-slate-900">
                {t.name}
              </option>
            ))}
            <option value="Unassigned" className="text-slate-900">Unassigned</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-slate-600">
            <span className="text-[10px]">▲▼</span>
          </div>
        </div>
      </td>

      {/* 3. Sequence Number Input */}
      <td className="py-2 px-2 text-center w-16">
        <input
          type="text"
          value={wo.sequenceNum || ''}
          onChange={(e) => handleSequenceChange(e.target.value)}
          placeholder="--"
          className={`w-11 text-center font-mono font-black text-xs py-1 rounded border shadow-inner focus:outline-none ${
            isDarkRow
              ? 'bg-white/90 text-slate-950 border-white/70 focus:bg-white'
              : 'bg-white text-slate-900 border-slate-300 focus:border-emerald-500'
          }`}
        />
      </td>

      {/* 4. Quick Inspect Eye Button */}
      <td className="py-2 px-2 text-center w-12">
        <button
          onClick={() => setQuickInspectWO(wo)}
          title="Quick Inspect Job Site & Property Specs"
          className="p-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-sm transition transform active:scale-90 inline-flex items-center justify-center"
        >
          <div className="relative flex items-center justify-center w-5 h-5">
            <Eye className="w-4 h-4 text-amber-900" />
          </div>
        </button>
      </td>

      {/* 5. Nested Checkbox */}
      <td className="py-2 px-2 text-center w-12">
        <input
          type="checkbox"
          checked={wo.flags.isNested || false}
          onChange={handleToggleNested}
          className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
        />
      </td>

      {/* 6. Messages / Status Icon Badges */}
      <td className="py-2 px-3 w-56">
        <div className="flex items-center space-x-1.5 bg-black/10 backdrop-blur-sm p-1 rounded-lg border border-black/10 min-h-[30px] inline-flex">
          {wo.flags.hasDocument && (
            <span title="Work Order & Service Preset Attached" className="p-0.5 bg-amber-300 text-amber-950 rounded shadow-xs text-xs font-bold">
              📝
            </span>
          )}

          {wo.flags.hasHazard && (
            <span title="Priority Alert" className="p-0.5 bg-red-600 text-white rounded shadow-xs text-xs font-extrabold px-1">
              !
            </span>
          )}

          {wo.flags.hasNotes && (
            <span title="Technician Field Notes" className="p-0.5 bg-sky-200 text-sky-950 rounded shadow-xs text-xs">
              ✏️
            </span>
          )}

          {wo.hazards && (
            <span title={`Safety Hazard / Gate Code: ${wo.hazards}`} className="p-0.5 bg-amber-400 text-amber-950 rounded shadow-xs text-xs animate-bounce">
              ⚠️
            </span>
          )}

          {wo.flags.hasEquipment && (
            <span title={`Equipment Assigned: ${wo.assetType}`} className="p-0.5 bg-slate-300 text-slate-900 rounded shadow-xs text-xs">
              🚚
            </span>
          )}

          {wo.flags.hasMaterial && (
            <span title={`Materials: ${wo.material}`} className="p-0.5 bg-amber-200 text-amber-900 rounded shadow-xs text-xs">
              🛢️
            </span>
          )}

          {wo.flags.hasDriver && (
            <span title={`Technician Assigned: ${wo.technicianName}`} className="p-0.5 bg-blue-300 text-blue-950 rounded shadow-xs text-xs">
              👷
            </span>
          )}

          {wo.flags.isCompleted && (
            <span title="Completed & Verified" className="p-0.5 bg-emerald-600 text-white rounded-full shadow-xs text-xs px-1 font-bold">
              ✓
            </span>
          )}
        </div>
      </td>

      {/* 7. Customer & Job Site Property */}
      <td className="py-2 px-3">
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <span className={`font-bold text-xs ${isDarkRow ? 'text-white' : 'text-slate-900'}`}>
              {wo.customerName}
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider flex items-center ${
              wo.propertyType === 'Commercial' 
                ? 'bg-blue-900 text-white' 
                : 'bg-emerald-900 text-white'
            }`}>
              {wo.propertyType === 'Commercial' ? '🏢 Commercial' : '🏡 Residential'}
            </span>
          </div>
          <span className={`text-[11px] truncate max-w-xs ${isDarkRow ? 'text-white/80' : 'text-slate-600'}`}>
            {wo.jobName ? `${wo.jobName} • ` : ''}{wo.jobAddress}, {wo.jobCity}
          </span>
        </div>
      </td>

      {/* 8. Service & Requirements */}
      <td className="py-2 px-3">
        <div className="flex flex-col">
          <span className={`font-semibold text-xs truncate max-w-xs ${isDarkRow ? 'text-white' : 'text-slate-800'}`}>
            {wo.serviceTypeName || wo.jobName || 'Grounds Maintenance'}
          </span>
          <div className="flex items-center space-x-1 text-[11px] mt-0.5">
            {wo.turfSqFt && (
              <span className={`px-1 py-0.2 rounded font-mono text-[10px] ${
                isDarkRow ? 'bg-black/30 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {wo.turfSqFt.toLocaleString()} sq ft
              </span>
            )}
            {wo.assetType && (
              <span className={`px-1 py-0.2 rounded font-medium ${
                isDarkRow ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {wo.assetType}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* 9. Financial Balance & Quick Actions */}
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end space-x-2">
          <div className="flex flex-col text-right">
            <span className={`font-bold font-mono text-xs ${
              isDarkRow ? 'text-white' : wo.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'
            }`}>
              ${wo.balanceDue?.toFixed(2) || '0.00'}
            </span>
            <span className={`text-[10px] ${isDarkRow ? 'text-white/70' : 'text-slate-400'}`}>
              {wo.isPaidInFull ? 'Paid' : 'Due'}
            </span>
          </div>

          <div className="flex items-center space-x-1 pl-2">
            <button
              onClick={() => openWorkOrderModal(wo)}
              className={`p-1 rounded hover:bg-black/20 transition ${isDarkRow ? 'text-white' : 'text-slate-600'}`}
              title="Edit Full Work Order"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete work order ${wo.woNumber}?`)) {
                  deleteWorkOrder(wo.id);
                }
              }}
              className={`p-1 rounded hover:bg-red-500/30 text-red-200 transition ${isDarkRow ? 'text-red-200' : 'text-red-500'}`}
              title="Delete Work Order"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};
