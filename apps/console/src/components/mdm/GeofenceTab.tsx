import React, { useState } from 'react';
import type { MdmGeofence, MdmDevice } from '@openmsp/api-types';
import { Shield, MapPin, AlertTriangle, Volume2, Lock, FileText, Check } from 'lucide-react';

interface GeofenceTabProps {
  geofences: MdmGeofence[];
  devices: MdmDevice[];
  onTriggerToast: (msg: string) => void;
}

export const GeofenceTab: React.FC<GeofenceTabProps> = ({ geofences, devices, onTriggerToast }) => {
  const current = geofences[0] || {
    id: 'geo-chi-01',
    name: 'Chicago Main Facility',
    radiusMeters: 450,
    breachAction: { siren: true, lockScreen: true, psaTicket: true, wipeAfterMinutes: 60 },
    activeDevicesCount: 17,
    breachDevicesCount: 1
  };

  const [siren, setSiren] = useState(current.breachAction.siren);
  const [lockScreen, setLockScreen] = useState(current.breachAction.lockScreen);
  const [psaTicket, setPsaTicket] = useState(current.breachAction.psaTicket);
  const [wipeTimeout, setWipeTimeout] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Geofencing & Anti-Theft Perimeter Security</h2>
          <p className="text-xs text-slate-400">
            Enforce geographic boundaries. Automatically sound sirens, lock displays, and open PSA tickets on boundary breach.
          </p>
        </div>
        <button
          onClick={() => onTriggerToast('Saved perimeter security rules!')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition shadow-md shadow-emerald-950 flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" /> Save Geofence Rules
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Map Visualizer */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden relative flex flex-col justify-between h-[480px]">
          {/* Map Grid Background */}
          <div className="absolute inset-0 bg-[#0b1120] opacity-90">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-geo" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-geo)" />

              {/* Roads */}
              <path d="M 0 150 Q 200 180 500 130 T 900 200" fill="none" stroke="#334155" strokeWidth="4" opacity="0.6" />
              <path d="M 300 0 L 350 480" fill="none" stroke="#334155" strokeWidth="3" opacity="0.6" />

              {/* Green Authorized Geofence Polygon */}
              <polygon
                points="120,80 420,70 450,280 150,310"
                fill="rgba(16, 185, 129, 0.15)"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4"
              />

              {/* Authorized Devices (Green Pins) */}
              <circle cx="220" cy="160" r="7" fill="#10b981" />
              <circle cx="220" cy="160" r="14" fill="none" stroke="#10b981" opacity="0.5" className="animate-ping" />
              <text x="235" y="165" fill="#f1f5f9" fontSize="10" fontFamily="sans-serif">
                Forklift #104 (In Zone)
              </text>

              <circle cx="310" cy="210" r="7" fill="#10b981" />
              <text x="325" y="215" fill="#f1f5f9" fontSize="10" fontFamily="sans-serif">
                POS Register #02 (In Zone)
              </text>

              {/* Breached Device (Red Alert Pin) */}
              <circle cx="580" cy="360" r="8" fill="#ef4444" />
              <circle cx="580" cy="360" r="20" fill="none" stroke="#ef4444" opacity="0.7" className="animate-ping" />
              <text x="595" y="365" fill="#f87171" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
                Delivery Van #3 (BREACH)
              </text>
              <line x1="450" y1="280" x2="580" y2="360" stroke="#ef4444" strokeWidth="2" strokeDasharray="3" />
            </svg>
          </div>

          {/* Top Controls Overlay */}
          <div className="relative z-10 flex justify-between items-center bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Active Perimeter: {current.name}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">Radius: {current.radiusMeters}m</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">Live GPS Cadence: 15s</div>
          </div>

          {/* Bottom Summary Overlay */}
          <div className="relative z-10 flex justify-between items-center bg-slate-900/90 backdrop-blur border border-slate-800 p-2.5 rounded-xl text-xs">
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {current.activeDevicesCount} Inside Safe Zone
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> {current.breachDevicesCount} Breach Detected
              </span>
            </div>
            <button
              onClick={() => onTriggerToast('Locked Delivery Van #3 Tablet with high-volume siren!')}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded text-xs font-semibold shadow transition active:scale-95"
            >
              Lock Escaped Device
            </button>
          </div>
        </div>

        {/* Perimeter Breach Rules Configuration Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-white text-sm">Automated Breach Policy</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={siren}
                onChange={(e) => setSiren(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0"
              />
              <div>
                <div className="font-medium text-white flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-fuchsia-400" />
                  Sound Siren on Tablet
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Plays maximum volume alert siren over tablet speaker, bypassing mute.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={lockScreen}
                onChange={(e) => setLockScreen(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0"
              />
              <div>
                <div className="font-medium text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Full-Screen Anti-Theft Lock
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Displays un-dismissible warning: "Property of Apex. Return immediately."
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={psaTicket}
                onChange={(e) => setPsaTicket(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0"
              />
              <div>
                <div className="font-medium text-white flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Auto-Create High-Priority PSA Ticket
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Logs incident in OpenMSP PSA and alerts the on-call technician.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={wipeTimeout}
                onChange={(e) => setWipeTimeout(e.target.checked)}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0"
              />
              <div>
                <div className="font-medium text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Remote Wipe on 1-Hour Breach
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Executes silent factory wipe if device stays outside perimeter for &gt;60 minutes.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
