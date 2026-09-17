import React, { useEffect, useState, useCallback } from 'react';
import { apexMdm } from '../../services/api';
import type { MdmDevice, MdmProfile, MdmApplication, MdmFile, MdmGeofence } from '@openmsp/api-types';
import {
  Smartphone, Shield, Terminal, QrCode, Radio, RefreshCw, SlidersHorizontal,
  FolderOpen, AppWindow, LayoutDashboard, Loader2, CheckCircle2, AlertTriangle,
  Battery, Wifi, Activity, ArrowRight, Zap, ShieldAlert, Sparkles
} from 'lucide-react';

import { FleetTab } from './FleetTab';
import { ApplicationsTab } from './ApplicationsTab';
import { ConfigurationsTab } from './ConfigurationsTab';
import { FilesTab } from './FilesTab';
import { GeofenceTab } from './GeofenceTab';
import { ShellTab } from './ShellTab';
import { ZeroTouchTab } from './ZeroTouchTab';
import { RemoteModal } from './RemoteModal';
import { BroadcastModal } from './BroadcastModal';

export const ApexMdmView: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('summary');

  const [devices, setDevices] = useState<MdmDevice[]>([]);
  const [profiles, setProfiles] = useState<MdmProfile[]>([]);
  const [apps, setApps] = useState<MdmApplication[]>([]);
  const [files, setFiles] = useState<MdmFile[]>([]);
  const [geofences, setGeofences] = useState<MdmGeofence[]>([]);

  const [loading, setLoading] = useState(true);
  const [remoteDevice, setRemoteDevice] = useState<MdmDevice | null>(null);
  const [shellTargetDevice, setShellTargetDevice] = useState<MdmDevice | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 3500);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, pRes, aRes, fRes, gRes] = await Promise.all([
        apexMdm.getDevices().catch(() => ({ configured: true, devices: [] })),
        apexMdm.getProfiles().catch(() => ({ profiles: [] })),
        apexMdm.getApps().catch(() => ({ apps: [] })),
        apexMdm.getFiles().catch(() => ({ files: [] })),
        apexMdm.getGeofences().catch(() => ({ geofences: [] })),
      ]);
      setDevices(dRes.devices || []);
      setProfiles(pRes.profiles || []);
      setApps(aRes.apps || []);
      setFiles(fRes.files || []);
      setGeofences(gRes.geofences || []);
    } catch (e) {
      console.error('Failed to load ApexMDM data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleReboot = async (device: MdmDevice) => {
    try {
      await apexMdm.sendCommand(device.id, 'reboot');
      showToast(`Reboot signal sent to ${device.name}`);
    } catch {
      showToast(`Failed to dispatch reboot to ${device.name}`);
    }
  };

  const handleOpenShell = (device: MdmDevice) => {
    setShellTargetDevice(device);
    setCurrentTab('shell');
  };

  // Metrics calculation
  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.status === 'online').length;
  const kioskDevices = devices.filter((d) => d.kioskModeActive).length;
  const batteryAttention = devices.filter(
    (d) => (d.batteryHealthPercent !== undefined && d.batteryHealthPercent < 80) || d.status === 'attention'
  ).length;
  const activeGeofences = geofences.length;
  const breachCount = geofences.reduce((acc, g) => acc + (g.breachDevicesCount || 0), 0);

  const TABS = [
    { key: 'summary', label: 'Overview', Icon: LayoutDashboard },
    { key: 'fleet', label: 'Fleet', Icon: Smartphone, count: totalDevices },
    { key: 'applications', label: 'Applications', Icon: AppWindow, count: apps.length },
    { key: 'configurations', label: 'Configurations', Icon: SlidersHorizontal, count: profiles.length },
    { key: 'files', label: 'Files & Payloads', Icon: FolderOpen, count: files.length },
    { key: 'geofence', label: 'Geofencing', Icon: Shield, count: breachCount > 0 ? `${breachCount} breach` : undefined },
    { key: 'shell', label: 'Remote Shell', Icon: Terminal },
    { key: 'zerotouch', label: 'Zero-Touch & QR', Icon: QrCode },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0f172a] text-slate-100 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 border border-fuchsia-500/50 text-white text-xs font-semibold rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-fuchsia-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/20">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">ApexMDM</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 rounded-full">
                Native Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">Zero-License Native Android Enterprise & Kiosk Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowBroadcast(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors shadow-sm"
          >
            <Radio className="w-3.5 h-3.5 text-fuchsia-400" />
            Broadcast Alert
          </button>

          <button
            onClick={() => setCurrentTab('zerotouch')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors shadow-sm shadow-fuchsia-600/30"
          >
            <QrCode className="w-3.5 h-3.5" />
            Enroll Device
          </button>

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh Fleet Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-fuchsia-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-6 border-b border-slate-800 bg-slate-900/40 overflow-x-auto">
        {TABS.map((t) => {
          const active = currentTab === t.key;
          const Icon = t.Icon;
          return (
            <button
              key={t.key}
              onClick={() => setCurrentTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-fuchsia-500 text-white bg-slate-800/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-fuchsia-400' : 'text-slate-500'}`} />
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    active ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950 p-6">
        {loading && devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
            <p className="text-xs text-slate-400">Synchronizing ApexMDM engine data...</p>
          </div>
        ) : (
          <>
            {currentTab === 'summary' && (
              <div className="space-y-6 max-w-7xl mx-auto">
                {/* 4 Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div
                    onClick={() => setCurrentTab('fleet')}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-1px] group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Fleet Enrolled</span>
                      <Smartphone className="w-4 h-4 text-fuchsia-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">{totalDevices}</span>
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {onlineDevices} online
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Android Enterprise dedicated tablets & scanners</p>
                  </div>

                  <div
                    onClick={() => setCurrentTab('fleet')}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-1px] group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Battery Degradation</span>
                      <Battery className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">{batteryAttention}</span>
                      <span className="text-xs text-amber-400 font-medium">
                        {batteryAttention > 0 ? 'Requires attention' : 'All healthy'}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Cycle-count and impedance wear analytics</p>
                  </div>

                  <div
                    onClick={() => setCurrentTab('geofence')}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-1px] group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Active Safezones</span>
                      <Shield className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">{activeGeofences}</span>
                      {breachCount > 0 ? (
                        <span className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                          {breachCount} breach alert
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">All inside zone</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Perimeter fence & anti-theft siren armed</p>
                  </div>

                  <div
                    onClick={() => setCurrentTab('configurations')}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:translate-y-[-1px] group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Kiosk Lock-Task</span>
                      <SlidersHorizontal className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">{kioskDevices}</span>
                      <span className="text-xs text-purple-300 font-medium">Restricted UI</span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Hardware keys & settings app suppressed</p>
                  </div>
                </div>

                {/* Main Split Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Quick Actions & Provisioning */}
                  <div className="space-y-4">
                    <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-fuchsia-400" />
                        Quick Provisioning
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Enroll factory-reset Android devices in seconds using standard 6-tap QR provisioning.
                      </p>

                      <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400">
                            <QrCode className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white">Default Warehouse Bundle</div>
                            <div className="text-[11px] text-slate-500">Auto Wi-Fi + DPC APK direct sync</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setCurrentTab('zerotouch')}
                          className="px-2.5 py-1 text-xs font-medium text-fuchsia-300 hover:text-white bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/30 rounded-md transition-colors"
                        >
                          View QR
                        </button>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setShowBroadcast(true)}
                          className="flex items-center justify-center gap-1.5 p-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                        >
                          <Radio className="w-3.5 h-3.5 text-fuchsia-400" />
                          Fleet Alert
                        </button>
                        <button
                          onClick={() => setCurrentTab('applications')}
                          className="flex items-center justify-center gap-1.5 p-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                        >
                          <AppWindow className="w-3.5 h-3.5 text-amber-400" />
                          Push APK
                        </button>
                      </div>
                    </div>

                    {/* Geofence Alert Preview */}
                    {breachCount > 0 && (
                      <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-rose-200">Perimeter Breach Triggered</div>
                          <p className="text-[11px] text-rose-300/80 mt-1">
                            {breachCount} device(s) reported GPS coordinates outside designated facility geofence. Automatic siren and PSA ticket dispatched.
                          </p>
                          <button
                            onClick={() => setCurrentTab('geofence')}
                            className="mt-2 text-xs font-semibold text-rose-300 hover:text-white underline flex items-center gap-1"
                          >
                            Inspect Coordinates <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column (2 cols): Live Fleet Activity */}
                  <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Live Fleet Roster</h3>
                        <p className="text-xs text-slate-400">Real-time status, battery telemetry, and remote actions</p>
                      </div>
                      <button
                        onClick={() => setCurrentTab('fleet')}
                        className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1"
                      >
                        Manage All <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="divide-y divide-slate-800/60">
                      {devices.slice(0, 5).map((d) => (
                        <div
                          key={d.id}
                          className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-lg transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">{d.name}</span>
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    d.status === 'online'
                                      ? 'bg-emerald-400'
                                      : d.status === 'attention'
                                      ? 'bg-amber-400'
                                      : 'bg-slate-500'
                                  }`}
                                />
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {d.model} • {d.osVersion} • {d.configName}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-slate-300 font-medium flex items-center justify-end gap-1">
                                <Battery className="w-3.5 h-3.5 text-slate-400" />
                                {d.batteryLevel}%
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {(d.batteryHealthPercent ?? 100) < 80 ? 'Wear alert' : 'Healthy'}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setRemoteDevice(d)}
                                className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
                              >
                                Remote
                              </button>
                              <button
                                onClick={() => handleOpenShell(d)}
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                                title="Root Shell"
                              >
                                <Terminal className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'fleet' && (
              <FleetTab
                devices={devices}
                onOpenRemote={(d) => setRemoteDevice(d)}
                onOpenShell={(d) => handleOpenShell(d)}
                onReboot={handleReboot}
                onRefresh={loadAll}
                onTriggerToast={showToast}
              />
            )}

            {currentTab === 'applications' && (
              <ApplicationsTab
                apps={apps}
                onTriggerToast={showToast}
                onRefresh={loadAll}
              />
            )}

            {currentTab === 'configurations' && (
              <ConfigurationsTab
                profiles={profiles}
                onTriggerToast={showToast}
                onRefresh={loadAll}
              />
            )}

            {currentTab === 'files' && (
              <FilesTab
                files={files}
                onTriggerToast={showToast}
                onRefresh={loadAll}
              />
            )}

            {currentTab === 'geofence' && (
              <GeofenceTab
                geofences={geofences}
                devices={devices}
                onTriggerToast={showToast}
              />
            )}

            {currentTab === 'shell' && (
              <ShellTab
                devices={devices}
                targetDevice={shellTargetDevice || undefined}
                onTriggerToast={showToast}
              />
            )}

            {currentTab === 'zerotouch' && (
              <ZeroTouchTab
                onTriggerToast={showToast}
              />
            )}
          </>
        )}
      </div>

      {/* Remote View & AI Logcat Modal */}
      {remoteDevice && (
        <RemoteModal
          device={remoteDevice}
          onClose={() => setRemoteDevice(null)}
          onTriggerToast={showToast}
        />
      )}

      {/* Fleet Broadcast Modal */}
      {showBroadcast && (
        <BroadcastModal
          profiles={profiles}
          onClose={() => setShowBroadcast(false)}
          onSuccess={() => showToast('Fleet broadcast alert sent successfully')}
        />
      )}
    </div>
  );
};
