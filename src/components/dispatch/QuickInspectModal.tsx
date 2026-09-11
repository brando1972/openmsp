import React from 'react';
import { useApp } from '../../data/AppContext';
import { 
  X, 
  MapPin, 
  Phone, 
  Mail, 
  AlertTriangle, 
  Truck, 
  Package, 
  DollarSign, 
  CheckCircle2, 
  Calendar, 
  Edit3, 
  ExternalLink,
  ShieldAlert,
  Building2,
  Home,
  UserCheck,
  Scissors
} from 'lucide-react';

export const QuickInspectModal: React.FC = () => {
  const { 
    quickInspectWO, 
    setQuickInspectWO, 
    openWorkOrderModal, 
    updateWorkOrder 
  } = useApp();

  if (!quickInspectWO) return null;

  const wo = quickInspectWO;

  const handleStatusChange = (newStatus: any, isCompleted: boolean = false) => {
    const updated = {
      ...wo,
      status: newStatus,
      flags: {
        ...wo.flags,
        isCompleted: isCompleted
      },
      journalLogs: [
        {
          id: `j-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          author: 'Dispatcher',
          message: `Status updated to ${newStatus}${isCompleted ? ' (Marked Complete)' : ''}`,
          type: 'status' as const
        },
        ...wo.journalLogs
      ]
    };
    updateWorkOrder(updated);
    setQuickInspectWO(updated);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-300 transform transition-transform duration-300 ease-in-out"
      >
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold">
                {wo.woNumber}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                wo.status === 'urgent' ? 'bg-fuchsia-600 text-white' :
                wo.status === 'attention' ? 'bg-amber-600 text-white' :
                wo.status === 'completed' ? 'bg-emerald-700 text-white' :
                wo.status === 'active' ? 'bg-green-600 text-white' :
                'bg-cyan-600 text-white'
              }`}>
                {wo.status}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                wo.propertyType === 'Commercial' ? 'bg-blue-600 text-white' : 'bg-emerald-700 text-white'
              }`}>
                {wo.propertyType || 'Residential'}
              </span>
            </div>
            <h2 className="text-base font-bold text-white mt-1 line-clamp-1">{wo.jobName || wo.customerName}</h2>
          </div>
          <button
            onClick={() => setQuickInspectWO(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-slate-800">
          {/* Site Hazard Warning Banner */}
          {wo.hazards && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg shadow-sm">
              <div className="flex items-start">
                <ShieldAlert className="w-5 h-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 text-xs uppercase tracking-wider">Site Access, Gate & Safety Hazards</h4>
                  <p className="text-amber-800 text-xs font-medium mt-0.5">{wo.hazards}</p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Action Status Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Quick Route Action</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleStatusChange('active', false)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  wo.status === 'active' 
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' 
                    : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                ▶ On-Site / Active
              </button>
              <button
                onClick={() => handleStatusChange('urgent', false)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  wo.status === 'urgent' 
                    ? 'bg-fuchsia-600 text-white border-fuchsia-700 shadow-sm' 
                    : 'bg-white text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50'
                }`}
              >
                ⚡ Priority
              </button>
              <button
                onClick={() => handleStatusChange('completed', true)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  wo.flags.isCompleted 
                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm' 
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                }`}
              >
                ✓ Mark Done
              </button>
            </div>
          </div>

          {/* Customer & Job Site Property */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
                {wo.propertyType === 'Commercial' ? (
                  <Building2 className="w-3.5 h-3.5 mr-1 text-blue-600" />
                ) : (
                  <Home className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                )}
                {wo.propertyType || 'Residential'} Job Site
              </span>
              {wo.billingProfileLabel && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded border border-slate-300">
                  Bill: {wo.billingProfileLabel}
                </span>
              )}
            </div>

            <div>
              <div className="font-bold text-base text-slate-900">{wo.customerName}</div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 mt-1">
                <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="font-medium">{wo.jobAddress}, {wo.jobCity}, {wo.jobState} {wo.jobZip}</span>
              </div>
            </div>

            {/* Turf Specs Card */}
            <div className="grid grid-cols-3 gap-2 bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200 text-xs">
              <div>
                <span className="text-[10px] text-emerald-800 font-bold block">Turf Area</span>
                <span className="font-mono font-bold text-emerald-950">{wo.turfSqFt ? `${wo.turfSqFt.toLocaleString()} sq ft` : '--'}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 font-bold block">Grass Type</span>
                <span className="font-semibold text-emerald-950">{wo.grassType || 'Turfgrass'}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 font-bold block">Deck Cut Height</span>
                <span className="font-mono font-bold text-emerald-950">{wo.cutHeightInches ? `${wo.cutHeightInches}"` : '3.0"'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center space-x-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <a href={`tel:${wo.customerPhone}`} className="text-blue-600 hover:underline font-semibold">
                  {wo.customerPhone || wo.jobCell || 'No phone'}
                </a>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600 truncate">{wo.customerEmail || 'No email'}</span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wo.jobAddress + ' ' + wo.jobCity + ' ' + wo.jobState)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in GPS Navigation</span>
              </a>
            </div>
          </div>

          {/* Technician Assignment & Service */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
            <span className="text-xs font-bold text-slate-500 uppercase block border-b border-slate-100 pb-2">
              Technician & Service Requirements
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold flex items-center">
                  <UserCheck className="w-3 h-3 mr-1 text-emerald-600" /> Assigned Technician
                </span>
                <span className="font-bold text-slate-900 text-sm">{wo.technicianName || 'Unassigned'}</span>
                <span className="text-slate-500 block text-[10px]">Seq #{wo.sequenceNum || '--'}</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Scheduled Date</span>
                <span className="font-bold text-slate-900 text-sm">{wo.date}</span>
                <span className="text-slate-500 block text-[10px]">{wo.autoScheduled ? 'Auto-Recurring' : 'One-Time'}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs bg-emerald-50 p-2 rounded-lg border border-emerald-200">
              <Scissors className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <div>
                <span className="font-bold text-emerald-950">Service:</span>
                <span className="text-emerald-900 ml-1 font-medium">{wo.serviceTypeName || wo.jobName}</span>
              </div>
            </div>

            {wo.assetType && (
              <div className="flex items-center space-x-2 text-xs bg-blue-50 p-2 rounded-lg border border-blue-100">
                <Truck className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div>
                  <span className="font-bold text-blue-950">Equipment / Mower:</span>
                  <span className="text-blue-900 ml-1 font-medium">{wo.assetType} {wo.assetId ? `(#${wo.assetId})` : ''}</span>
                </div>
              </div>
            )}

            {wo.material && wo.material !== 'None' && (
              <div className="flex items-center space-x-2 text-xs bg-amber-50 p-2 rounded-lg border border-amber-200">
                <Package className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <div>
                  <span className="font-bold text-amber-950">Materials:</span>
                  <span className="text-amber-900 ml-1 font-medium">{wo.material}</span>
                </div>
              </div>
            )}

            {wo.notes && (
              <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-700 block mb-1">Technician Notes:</span>
                <p className="text-slate-800 whitespace-pre-wrap">{wo.notes}</p>
              </div>
            )}
          </div>

          {/* Financials & Balance */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2 text-xs">
            <span className="text-xs font-bold text-slate-500 uppercase block border-b border-slate-100 pb-2">
              Financial Summary
            </span>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Work Order Price:</span>
              <span className="font-bold text-slate-900 text-sm">${wo.totalAmount?.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Payment Method:</span>
              <span className="font-semibold text-slate-800">{wo.paymentMethod || 'On File'}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="font-bold text-slate-700">Outstanding Balance:</span>
              <span className={`font-mono font-bold text-sm ${wo.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                ${wo.balanceDue?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => {
              setQuickInspectWO(null);
              openWorkOrderModal(wo);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition shadow"
          >
            <Edit3 className="w-4 h-4" />
            <span>Open Full Work Order</span>
          </button>

          <button
            onClick={() => setQuickInspectWO(null)}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
