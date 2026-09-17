import React, { useState } from 'react';
import type { MdmProfile } from '@openmsp/api-types';
import { SlidersHorizontal, Check, Copy } from 'lucide-react';
import { apexMdm } from '../../services/api';

interface ConfigurationsTabProps {
  profiles: MdmProfile[];
  onTriggerToast: (msg: string) => void;
  onRefresh: () => void;
}

export const ConfigurationsTab: React.FC<ConfigurationsTabProps> = ({ profiles, onTriggerToast, onRefresh }) => {
  const activeProfile = profiles[0] || {
    id: 'kiosk-warehouse-101',
    name: 'Warehouse Kiosk',
    description: 'Single/multi-app lock for warehouse scanning terminals and forklifts.',
    kioskMode: 'locktask',
    orientation: 'landscape',
    screenTimeoutSec: 0,
    brightnessPercent: 80,
    titleBarTemplate: '${DEVICE_NAME} • ${IP} • ${BATTERY}%',
    wifiRescueEnabled: true,
    volumeLocked: true,
    lockVolumePercent: 80,
    autoGrantPermissions: true,
    autostartPackage: 'com.apexmsp.wms',
    nightModeDimEnabled: true,
    pushProtocol: 'mqtt',
    cameraDisabled: false,
    usbStorageBlocked: true,
    factoryResetBlocked: true,
    gpsForcedOn: true
  };

  const [orientation, setOrientation] = useState(activeProfile.orientation);
  const [screenTimeout, setScreenTimeout] = useState(String(activeProfile.screenTimeoutSec));
  const [titleTemplate, setTitleTemplate] = useState(activeProfile.titleBarTemplate);
  const [wifiRescue, setWifiRescue] = useState(activeProfile.wifiRescueEnabled);
  const [volumeLock, setVolumeLock] = useState(activeProfile.volumeLocked);
  const [autoGrant, setAutoGrant] = useState(activeProfile.autoGrantPermissions);
  const [cameraDisabled, setCameraDisabled] = useState(activeProfile.cameraDisabled);
  const [usbBlocked, setUsbBlocked] = useState(activeProfile.usbStorageBlocked);
  const [gpsForced, setGpsForced] = useState(activeProfile.gpsForcedOn);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apexMdm.updateProfile(activeProfile.id, {
        orientation,
        screenTimeoutSec: Number(screenTimeout),
        titleBarTemplate: titleTemplate,
        wifiRescueEnabled: wifiRescue,
        volumeLocked: volumeLock,
        autoGrantPermissions: autoGrant,
        cameraDisabled,
        usbStorageBlocked: usbBlocked,
        gpsForcedOn: gpsForced
      });
      onTriggerToast('Saved configuration and pushed updates to fleet via MQTT!');
      onRefresh();
    } catch {
      onTriggerToast('Error saving configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Configuration Profile: <span className="text-fuchsia-400">{activeProfile.name}</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage launcher layout, hardware fail-safes, volume locks, and runtime permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTriggerToast(`Cloned ${activeProfile.name} as copy!`)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Clone Profile
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition shadow-md shadow-fuchsia-950 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Save & Push to Fleet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Kiosk & Policy Controls */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs uppercase tracking-wider font-bold text-fuchsia-400 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" /> 1. Kiosk Experience & Fail-Safes
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Orientation Lock</label>
                <select
                  value={orientation}
                  onChange={(e: any) => setOrientation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-fuchsia-500"
                >
                  <option value="landscape">Lock Landscape</option>
                  <option value="portrait">Lock Portrait</option>
                  <option value="auto">User Auto-Rotate</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Screen Timeout</label>
                <select
                  value={screenTimeout}
                  onChange={(e) => setScreenTimeout(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-fuchsia-500"
                >
                  <option value="0">Never Turn Off (Always On)</option>
                  <option value="15">15 Seconds</option>
                  <option value="60">1 Minute</option>
                  <option value="300">5 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Title Bar Template</label>
                <input
                  type="text"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-fuchsia-500"
                />
                <span className="text-[10px] text-slate-500">Variables: {'${DEVICE_NAME}'}, {'${IP}'}, {'${BATTERY}'}</span>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Push Transport Protocol</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-fuchsia-500">
                  <option>MQTT Protocol (Instant Push + Battery Saving)</option>
                  <option>HTTP Long Polling (Fallback)</option>
                </select>
              </div>
            </div>

            {/* Fail-Safe Toggles */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5 text-xs">
              <label className="flex items-center justify-between p-3 rounded-lg bg-fuchsia-950/20 border border-fuchsia-500/30 cursor-pointer">
                <div>
                  <div className="font-semibold text-fuchsia-200">Show Wi-Fi Dialog on Connection Error (Rescue Mode)</div>
                  <div className="text-[11px] text-slate-400">
                    If Wi-Fi drops, allows technician to enter new network credentials without breaking kiosk lockdown.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={wifiRescue}
                  onChange={(e) => setWifiRescue(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 cursor-pointer">
                <div>
                  <div className="font-medium text-slate-200">Lock Hardware Volume Buttons</div>
                  <div className="text-[11px] text-slate-400">Prevents users from turning off sound; locks speaker volume to 80%.</div>
                </div>
                <input
                  type="checkbox"
                  checked={volumeLock}
                  onChange={(e) => setVolumeLock(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 cursor-pointer">
                <div>
                  <div className="font-medium text-slate-200">Auto-Grant All Runtime Permissions</div>
                  <div className="text-[11px] text-slate-400">Automatically grants Camera, Storage, and Mic permissions to whitelisted apps.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoGrant}
                  onChange={(e) => setAutoGrant(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* Section 2: Hardware Restrictions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400">
              2. OS Restrictions (DevicePolicyManager)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                <span className="text-slate-200">Disable Camera Hardware</span>
                <input
                  type="checkbox"
                  checked={cameraDisabled}
                  onChange={(e) => setCameraDisabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                <span className="text-slate-200">Block USB Storage / MTP</span>
                <input
                  type="checkbox"
                  checked={usbBlocked}
                  onChange={(e) => setUsbBlocked(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                <span className="text-slate-200">Force GPS Location ON</span>
                <input
                  type="checkbox"
                  checked={gpsForced}
                  onChange={(e) => setGpsForced(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4"
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                <span className="text-slate-200">Block Factory Reset</span>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="rounded bg-slate-800 border-slate-700 text-fuchsia-500 focus:ring-0 w-4 h-4 opacity-60"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Live Landscape Kiosk Preview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col items-center">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">Landscape Kiosk Preview</h3>
          <div className="w-80 h-52 bg-black border-4 border-slate-700 rounded-2xl p-2.5 shadow-2xl relative flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-800/90 rounded text-[9px] text-slate-300 font-mono">
              <span className="font-bold text-fuchsia-400 truncate">Forklift #104 • 192.168.10.42</span>
              <span>📶 -54dBm | 92% ⚡</span>
            </div>

            <div className="grid grid-cols-3 gap-2 px-2 my-auto">
              <div className="bg-slate-800/80 border border-slate-700 p-2 rounded text-center cursor-pointer hover:bg-slate-700">
                <div className="w-6 h-6 rounded bg-fuchsia-600 mx-auto mb-1 flex items-center justify-center text-white text-[10px] font-bold">W</div>
                <div className="text-[9px] text-white truncate font-medium">WMS Scanner</div>
              </div>
              <div className="bg-slate-800/80 border border-slate-700 p-2 rounded text-center cursor-pointer hover:bg-slate-700">
                <div className="w-6 h-6 rounded bg-indigo-600 mx-auto mb-1 flex items-center justify-center text-white text-[10px] font-bold">P</div>
                <div className="text-[9px] text-white truncate font-medium">Pick & Pack</div>
              </div>
              <div className="bg-slate-800/80 border border-slate-700 p-2 rounded text-center cursor-pointer hover:bg-slate-700">
                <div className="w-6 h-6 rounded bg-slate-700 mx-auto mb-1 flex items-center justify-center text-white text-[10px] font-bold">⚙</div>
                <div className="text-[9px] text-slate-300 truncate font-medium">Wi-Fi Rescue</div>
              </div>
            </div>

            <div className="flex justify-between items-center px-2 text-[8px] text-slate-500">
              <span>Single App Pin Active</span>
              <span className="cursor-pointer hover:text-slate-300">Admin PIN: • • • •</span>
            </div>
          </div>

          <div className="mt-4 w-full bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] space-y-1.5 text-slate-400">
            <div className="flex justify-between"><span className="text-slate-500">Grid Layout:</span> <span className="text-slate-200">3x2 Density</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Volume Level:</span> <span className="text-slate-200">{volumeLock ? 'Locked (80%)' : 'Unlocked'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Autostart App:</span> <span className="text-fuchsia-400">com.apexmsp.wms</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
