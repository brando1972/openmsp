import React, { useState } from 'react';
import type { MdmProfile } from '@openmsp/api-types';
import { SlidersHorizontal, Check, Copy, Shield, Lock, Wifi, Volume2, Camera, HardDrive } from 'lucide-react';
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
    nightModeDimEnabled: false,
    pushProtocol: 'mqtt',
    cameraDisabled: false,
    usbStorageBlocked: true,
    wifiBlocked: false,
    bluetoothBlocked: false,
    allowedPackages: ['com.apexmsp.wms', 'com.android.settings'],
    updatedAt: new Date().toISOString()
  };

  const [kioskMode, setKioskMode] = useState(activeProfile.kioskMode);
  const [orientation, setOrientation] = useState(activeProfile.orientation);
  const [wifiRescue, setWifiRescue] = useState(activeProfile.wifiRescueEnabled);
  const [volumeLocked, setVolumeLocked] = useState(activeProfile.volumeLocked);
  const [cameraDisabled, setCameraDisabled] = useState(activeProfile.cameraDisabled);
  const [usbBlocked, setUsbBlocked] = useState(activeProfile.usbStorageBlocked);
  const [titleBar, setTitleBar] = useState(activeProfile.titleBarTemplate);

  const handleSave = async () => {
    try {
      await apexMdm.saveProfile({
        ...activeProfile,
        kioskMode: kioskMode as any,
        orientation: orientation as any,
        wifiRescueEnabled: wifiRescue,
        volumeLocked,
        cameraDisabled,
        usbStorageBlocked: usbBlocked,
        titleBarTemplate: titleBar
      });
      onTriggerToast('Configuration policy updated and broadcast to enrolled devices');
      onRefresh();
    } catch {
      onTriggerToast('Failed to save profile changes');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-white">Android Enterprise Kiosk & Policy Profiles</h2>
          <p className="text-xs text-slate-400">Lock down system navigation, enforce screen pin, and control hardware access</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          Save & Broadcast Profile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kiosk Mode Options */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Lock className="w-4 h-4 text-fuchsia-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Kiosk Lock-Task & Launcher
            </h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Kiosk Operating Mode</label>
            <select
              value={kioskMode}
              onChange={(e) => setKioskMode(e.target.value as any)}
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            >
              <option value="locktask">Strict LockTask Kiosk (Single App Locked, No System UI)</option>
              <option value="single-app">Dedicated App Auto-Restarter (With Watchdog)</option>
              <option value="multi-app">Multi-App Enterprise Launcher (Curated Workspace)</option>
              <option value="standard">Standard Managed Device (Open OS with Guardrails)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Screen Orientation Lock</label>
            <div className="grid grid-cols-3 gap-2">
              {(['landscape', 'portrait', 'auto'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrientation(o)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border capitalize transition-colors ${
                    orientation === o
                      ? 'border-fuchsia-500 bg-fuchsia-500/10 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Kiosk Top Status Bar Template
            </label>
            <input
              type="text"
              value={titleBar}
              onChange={(e) => setTitleBar(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Supports: <code className="text-fuchsia-400">{'${DEVICE_NAME}'}</code>, <code className="text-fuchsia-400">{'${IP}'}</code>, <code className="text-fuchsia-400">{'${BATTERY}'}</code>
            </p>
          </div>
        </div>

        {/* Hardware Restraints & Fail-safes */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Shield className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Hardware Locks & Fail-Safes
            </h3>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wifiRescue}
                onChange={(e) => setWifiRescue(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Wi-Fi Rescue Dialog (Critical)</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Automatically launches emergency Wi-Fi configuration modal if tablet disconnects for &gt; 3 minutes.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={volumeLocked}
                onChange={(e) => setVolumeLocked(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Lock Device Volume at 80%</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Prevents forklift operators from muting barcode scanner audio beeps.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={usbBlocked}
                onChange={(e) => setUsbBlocked(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Block USB Mass Storage / MTP</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Disables data transfer over USB cable while preserving standard fast-charging.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cameraDisabled}
                onChange={(e) => setCameraDisabled(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">Disable Hardware Camera</span>
                <span className="text-[11px] text-slate-400 leading-tight block">
                  Hardware-level lockout via DevicePolicyManager for sensitive facility zones.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
