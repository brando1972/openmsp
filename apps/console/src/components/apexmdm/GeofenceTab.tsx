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
    name: 'Chicago Main Logistics Center',
    centerLat: 41.8781,
    centerLng: -87.6298,
    radiusMeters: 450,
    breachAction: { siren: true, lockScreen: true, psaTicket: true, wipeAfterMinutes: 60 },
    activeDevicesCount: 2,
    breachDevicesCount: 1
  };

  const [siren, setSiren] = useState(current.breachAction.siren);
  const [lockScreen, setLockScreen] = useState(current.breachAction.lockScreen);
  const [psaTicket, setPsaTicket] = useState(current.breachAction.psaTicket);
  const [wipeTimeout, setWipeTimeout] = useState(false);

  const breachDevices = devices.filter((d) => d.geofenceStatus === 'breach');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-white">Geofencing & Anti-Theft Protection</h2>
          <p className="text-xs text-slate-400">
            Define warehouse and facility safezones with automated sirens, screen locks, and PSA tickets on perimeter breach
          </p>
        </div>
        <button
          onClick={() => onTriggerToast('Geofence policies armed and synchronized to GPS fleet')}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          Update & Arm Safezone
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Perimeter Settings */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <MapPin className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Safezone Perimeter Coordinates
            </h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Zone Name</label>
            <input
              type="text"
              defaultValue={current.name}
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Latitude</label>
              <input
                type="text"
                defaultValue={current.centerLat.toString()}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Longitude</label>
              <input
                type="text"
                defaultValue={current.centerLng.toString()}
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Allowed Radius (Meters)</label>
            <input
              type="number"
              defaultValue={current.radiusMeters}
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
          </div>
        </div>

        {/* Breach Automation Actions */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Automated Breach Triggers
            </h3>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={siren}
                onChange={(e) => setSiren(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Sound Anti-Theft Siren Alarm</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Plays max-volume piercing audio alarm continuously until authorized PIN unlock.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={lockScreen}
                onChange={(e) => setLockScreen(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Immediate Screen Lockout</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Displays full-screen stolen device overlay with facility return phone number.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={psaTicket}
                onChange={(e) => setPsaTicket(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Dispatch Critical PSA Ticket</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Automatically files high-priority security ticket with real-time GPS coordinates.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wipeTimeout}
                onChange={(e) => setWipeTimeout(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Factory Reset after 60 Minutes</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Triggers full enterprise remote wipe if tablet remains outside safezone for &gt; 1 hour.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Active Breach Warning Banner */}
      {breachDevices.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-bold text-rose-200">
              Active Geofence Breach ({breachDevices.length} Device Outside Safezone)
            </div>
            {breachDevices.map((d) => (
              <div key={d.id} className="text-[11px] text-rose-300">
                • <span className="font-semibold">{d.name}</span> ({d.model}) is outside Chicago perimeter at lat {d.location?.lat}, lng {d.location?.lng}. Siren trigger sent.
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
