import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { WorkOrder } from '../../types';
import { 
  Tractor, 
  MapPin, 
  Phone, 
  Navigation, 
  CheckCircle2, 
  Camera, 
  FileCheck, 
  ShieldAlert, 
  ChevronRight, 
  Clock, 
  User, 
  Layers,
  Sparkles,
  Building2,
  Home,
  UserCheck,
  Scissors
} from 'lucide-react';

export const MobileCrewView: React.FC = () => {
  const { 
    technicians, 
    workOrders, 
    updateWorkOrder, 
    currentDate, 
    mobileActiveTechId, 
    setMobileActiveTechId 
  } = useApp();

  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [hasBeforePhoto, setHasBeforePhoto] = useState(true);
  const [hasAfterPhoto, setHasAfterPhoto] = useState(false);

  const currentTech = technicians.find(t => t.id === mobileActiveTechId) || technicians[1]; // default Craig

  const techOrders = workOrders
    .filter(wo => (wo.technicianName === currentTech.name || wo.technicianId === currentTech.id) && (wo.date === currentDate || !wo.date))
    .sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));

  const activeJob = techOrders.find(w => w.id === selectedWOId) || techOrders[0];

  const handleToggleCheckItem = (field: keyof NonNullable<WorkOrder['fieldChecklist']>) => {
    if (!activeJob) return;

    const currentChecklist = activeJob.fieldChecklist || {};
    const updated = {
      ...activeJob,
      fieldChecklist: {
        ...currentChecklist,
        [field]: !currentChecklist[field]
      }
    };
    updateWorkOrder(updated);
  };

  const handleCompleteJob = () => {
    if (!activeJob) return;

    const updated: WorkOrder = {
      ...activeJob,
      status: 'completed',
      flags: {
        ...activeJob.flags,
        isCompleted: true
      },
      fieldChecklist: {
        ...activeJob.fieldChecklist,
        mowed: true,
        edged: true,
        weedTrimming: true,
        debrisBlown: true,
        gateClosedAndLocked: true,
        beforePhotoTaken: true,
        afterPhotoTaken: true,
        customerSigned: true,
        signedBy: signatureName || activeJob.customerName,
        completedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      },
      journalLogs: [
        {
          id: `j-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          author: currentTech.name,
          message: `Service completed on site. Verified gate lock, photos attached. Signed by: ${signatureName || activeJob.customerName}`,
          type: 'field_note'
        },
        ...activeJob.journalLogs
      ]
    };

    updateWorkOrder(updated);
    alert(`🎉 Success! Job #${activeJob.woNumber} completed and submitted to dispatch!`);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-slate-900 text-slate-100 overflow-hidden text-xs">
      {/* Left Column: Technician Selector & Stops List */}
      <div className="w-full md:w-80 bg-slate-950 border-r border-slate-800 flex flex-col h-auto md:h-full">
        <div className="p-4 border-b border-slate-800 bg-slate-900/90">
          <label className="text-[10px] font-black uppercase text-slate-400 block mb-1 flex items-center">
            <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Active Technician / Crew Lead:
          </label>
          <select
            value={currentTech.id}
            onChange={(e) => setMobileActiveTechId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white font-bold rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            {technicians.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.role}) - {t.vehicle}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
            <span>Date: <strong className="text-white">Aug 28, 2026</strong></span>
            <span>{techOrders.filter(w => w.flags.isCompleted).length} / {techOrders.length} Done</span>
          </div>
        </div>

        {/* Route Stops List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          <span className="text-[10px] font-extrabold uppercase text-slate-500 px-2 block py-1">
            Today's Route Stops ({techOrders.length})
          </span>

          {techOrders.map((wo, index) => {
            const isSelected = activeJob?.id === wo.id;
            const isDone = wo.flags.isCompleted || wo.status === 'completed';

            return (
              <div
                key={wo.id}
                onClick={() => setSelectedWOId(wo.id)}
                className={`p-3 rounded-xl cursor-pointer border transition ${
                  isSelected 
                    ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-lg' 
                    : isDone 
                      ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800' 
                      : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      isDone ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {isDone ? '✓' : wo.sequenceNum || index + 1}
                    </span>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h4 className="font-bold text-xs text-white line-clamp-1">{wo.customerName}</h4>
                        <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${
                          wo.propertyType === 'Commercial' ? 'bg-blue-600 text-white' : 'bg-emerald-700 text-white'
                        }`}>
                          {wo.propertyType === 'Commercial' ? 'COMM' : 'RES'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{wo.jobAddress}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                </div>

                <div className="flex items-center space-x-1.5 mt-2 text-[10px]">
                  {wo.hazards && (
                    <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded font-bold">
                      ⚠️ Hazard
                    </span>
                  )}
                  {wo.turfSqFt && (
                    <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 border border-slate-700 rounded font-mono">
                      {wo.turfSqFt.toLocaleString()} sq ft
                    </span>
                  )}
                  {wo.assetType && (
                    <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded">
                      {wo.assetType.split(' ')[0]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Active Job Execution */}
      {activeJob ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl">
          {/* Top Job Banner */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded bg-emerald-600 font-bold text-xs">
                    STOP #{activeJob.sequenceNum || '--'}
                  </span>
                  <span className="font-mono text-slate-400 text-xs">{activeJob.woNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    activeJob.propertyType === 'Commercial' ? 'bg-blue-600 text-white' : 'bg-emerald-700 text-white'
                  }`}>
                    {activeJob.propertyType || 'Residential'}
                  </span>
                  {activeJob.flags.isCompleted && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-[10px]">
                      ✓ COMPLETED
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-white mt-1">{activeJob.customerName}</h2>
                <p className="text-sm text-emerald-400 font-semibold">{activeJob.jobName}</p>
              </div>

              {/* GPS Navigation Button */}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeJob.jobAddress + ' ' + activeJob.jobCity + ' ' + activeJob.jobState)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-900/40 transition"
              >
                <Navigation className="w-4 h-4" />
                <span>Start GPS Navigation</span>
              </a>
            </div>

            {/* Address & Specs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center space-x-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-700">
                <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-slate-200 font-medium">{activeJob.jobAddress}, {activeJob.jobCity}, {activeJob.jobState} {activeJob.jobZip}</span>
              </div>

              <div className="flex items-center space-x-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-700">
                <Phone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <a href={`tel:${activeJob.customerPhone}`} className="text-emerald-400 hover:underline font-bold">
                  {activeJob.customerPhone || '(850) 438-9921'}
                </a>
              </div>
            </div>

            {/* Property Turf Specs */}
            <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3 rounded-xl border border-slate-700 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Turf Area</span>
                <span className="font-mono font-bold text-white text-sm">
                  {activeJob.turfSqFt ? `${activeJob.turfSqFt.toLocaleString()} sq ft` : '--'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Grass Species</span>
                <span className="font-semibold text-emerald-400">{activeJob.grassType || 'Turfgrass'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">Mower Deck Height</span>
                <span className="font-mono font-bold text-amber-300 text-sm">
                  {activeJob.cutHeightInches ? `${activeJob.cutHeightInches}"` : '3.0"'}
                </span>
              </div>
            </div>

            {/* Hazards Alert */}
            {activeJob.hazards && (
              <div className="bg-amber-500/15 border-l-4 border-amber-500 p-3 rounded-r-xl">
                <div className="flex items-start space-x-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-amber-300 uppercase tracking-wider text-xs">
                      Site Hazards & Gate Codes
                    </h4>
                    <p className="text-amber-200 mt-0.5 font-medium text-xs">{activeJob.hazards}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quality Checklist */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wide flex items-center">
              <FileCheck className="w-4 h-4 text-emerald-400 mr-2" />
              On-Site Quality Checklist
            </h3>

            <div className="space-y-2">
              {[
                { key: 'mowed', label: '1. Mowing & Turf Cut (Deck set to client cut height)' },
                { key: 'weedTrimming', label: '2. String Trimming around fences, trees & flowerbeds' },
                { key: 'edged', label: '3. Blade Edging along driveways and curbs' },
                { key: 'debrisBlown', label: '4. High-velocity Blowing of clippings from hard surfaces' },
                { key: 'gateClosedAndLocked', label: '5. CRITICAL: Backyard Gate Latched & Verified Locked' }
              ].map((item) => {
                const checked = activeJob.fieldChecklist?.[item.key as keyof typeof activeJob.fieldChecklist] || activeJob.flags.isCompleted;

                return (
                  <label
                    key={item.key}
                    onClick={() => handleToggleCheckItem(item.key as any)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition ${
                      checked 
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className="font-bold text-xs">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={() => {}}
                      className="w-5 h-5 rounded text-emerald-500 border-slate-600 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Proof of Work Photos */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wide flex items-center">
              <Camera className="w-4 h-4 text-cyan-400 mr-2" />
              Proof of Work Photos
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="border-2 border-dashed border-slate-700 bg-slate-900/60 rounded-xl p-4 text-center space-y-2">
                <span className="font-bold text-xs text-slate-300 block">Before Service</span>
                <div className="w-full h-24 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
                  <span className="text-emerald-400 text-xs font-bold">📷 Photo Captured (08:15 AM)</span>
                </div>
              </div>

              <div 
                onClick={() => setHasAfterPhoto(true)}
                className="border-2 border-dashed border-cyan-700/60 bg-cyan-950/20 hover:bg-cyan-950/40 rounded-xl p-4 text-center space-y-2 cursor-pointer transition"
              >
                <span className="font-bold text-xs text-cyan-300 block">After Service Photo</span>
                <div className="w-full h-24 bg-slate-800 rounded-lg flex flex-col items-center justify-center border border-slate-700 text-slate-400 hover:text-white">
                  {hasAfterPhoto ? (
                    <span className="text-emerald-400 text-xs font-bold">📷 Photo Captured (Just Now)</span>
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mb-1 text-cyan-400" />
                      <span className="text-[11px] font-bold text-cyan-300">Tap to Snap After Photo</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Customer Signature & Sign-Off */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wide">
              Customer Sign-Off (Optional)
            </h3>
            <div>
              <label className="text-slate-400 block text-[11px] mb-1">Printed Name:</label>
              <input
                type="text"
                placeholder={activeJob.customerName}
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-bold"
              />
            </div>
          </div>

          {/* Completion Button */}
          <div className="pt-2">
            <button
              onClick={handleCompleteJob}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-black text-base shadow-2xl shadow-emerald-950/50 transition transform active:scale-98 flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-6 h-6 stroke-[3]" />
              <span>COMPLETE JOB & NOTIFY DISPATCH</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 p-8">
          <div className="text-center space-y-2">
            <Tractor className="w-12 h-12 mx-auto text-slate-600" />
            <h3 className="text-base font-bold text-white">No active route stops for this technician today</h3>
            <p className="text-xs">Select another technician lead from the top dropdown.</p>
          </div>
        </div>
      )}
    </div>
  );
};
