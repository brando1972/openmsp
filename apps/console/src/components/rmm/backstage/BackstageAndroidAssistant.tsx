import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Shield,
  Zap,
  Copy,
  Check,
  Download,
  Play,
  RotateCw,
  RefreshCw,
  ExternalLink,
  Lock,
  Unlock,
  Terminal as TerminalIcon,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Battery,
  Wifi,
  Package,
  Cpu
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { api, StagedApp, DeviceStagedAppStatus } from '../../../services/api';

interface BackstageAndroidAssistantProps {
  device: ManagedDevice;
  onOpenTerminalWithCommand?: (cmd: string) => void;
}

export const BackstageAndroidAssistant: React.FC<BackstageAndroidAssistantProps> = ({
  device,
  onOpenTerminalWithCommand
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [isRunningAdb, setIsRunningAdb] = useState(false);
  const [adbOutput, setAdbOutput] = useState<string | null>(null);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [customAdbCmd, setCustomAdbCmd] = useState('dumpsys battery');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Staged apps
  const [stagedStatuses, setStagedStatuses] = useState<DeviceStagedAppStatus[]>([]);
  const [loadingStaged, setLoadingStaged] = useState(false);

  // ADB Server status
  const [adbServerStatus, setAdbServerStatus] = useState<{ connected: boolean; output?: string } | null>(null);

  const adbOneLiner = `adb shell appops set net.christianbeier.droidvnc_ng PROJECT_MEDIA allow && adb shell appops set net.christianbeier.droidvnc_ng SYSTEM_ALERT_WINDOW allow && adb shell appops set app.apexmsp.agent SYSTEM_ALERT_WINDOW allow && adb shell am start-foreground-service -n net.christianbeier.droidvnc_ng/.MainActivity`;

  // Fetch staged status and ADB status
  const loadData = useCallback(async () => {
    try {
      setLoadingStaged(true);
      const statuses = await api.stagedApps.getDeviceStatus(device.id);
      setStagedStatuses(statuses);
    } catch {
      /* ignore */
    } finally {
      setLoadingStaged(false);
    }

    try {
      const adbStat = await api.mdm.getAdbStatus(device.id);
      setAdbServerStatus({ connected: adbStat.connected, output: adbStat.devicesOutput });
    } catch {
      /* ignore */
    }
  }, [device.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(adbOneLiner);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  const handleRunAllowMedia = async () => {
    setIsRunningAdb(true);
    setAdbOutput(null);
    setAdbError(null);
    try {
      const res = await api.mdm.runAdb(device.id, 'allow_media');
      if (res.ok) {
        setAdbOutput(res.output || 'Permissions applied successfully! DroidVNC-NG is ready for unattended connections.');
        loadData();
      } else {
        setAdbError(res.error || res.note || 'Failed to execute command via server-side ADB.');
      }
    } catch (e: any) {
      setAdbError(e.message || 'Error communicating with ADB bridge.');
    } finally {
      setIsRunningAdb(false);
    }
  };

  const handleRunCustomAdb = async (cmdToRun?: string) => {
    const cmd = cmdToRun || customAdbCmd;
    if (!cmd.trim()) return;
    setIsRunningAdb(true);
    setAdbOutput(null);
    setAdbError(null);
    try {
      const res = await api.mdm.runAdb(device.id, 'custom', cmd.trim());
      if (res.ok) {
        setAdbOutput(`$ adb shell ${cmd}\n\n${res.output}`);
      } else {
        setAdbError(`$ adb shell ${cmd}\n\nError: ${res.error || res.note}`);
      }
    } catch (e: any) {
      setAdbError(e.message || 'Execution error.');
    } finally {
      setIsRunningAdb(false);
    }
  };

  const triggerAction = async (key: string, name: string, fn: () => Promise<any>) => {
    setActionLoading(key);
    setActionSuccess(null);
    try {
      await fn();
      setActionSuccess(`${name} executed successfully`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: any) {
      setAdbError(`Failed to ${name}: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenRemoteViewer = async () => {
    try {
      const viewer = await api.mdm.getViewerUrl(device.id);
      if (viewer && viewer.url) {
        window.open(viewer.url, `apex_vnc_${device.id}`, 'width=1280,height=800,menubar=no,toolbar=no');
      } else {
        window.open('https://vnc.apexmsp.app', '_blank');
      }
    } catch {
      window.open('https://vnc.apexmsp.app', '_blank');
    }
  };

  const handleDeployStagedApp = async (appId: string, appName: string) => {
    triggerAction(`deploy-${appId}`, `Deploy ${appName}`, async () => {
      await api.stagedApps.deployToDevice(appId, device.id);
      await loadData();
    });
  };

  const isDroidVncInstalled = stagedStatuses.some(
    s => (s.appId === 'staged-android-remote' || s.appName.toLowerCase().includes('droidvnc')) && s.status === 'installed'
  ) || (device.services || []).some(s => s.name.toLowerCase().includes('droidvnc'));

  return (
    <div className="flex-1 flex flex-col h-full bg-[#06080e] overflow-y-auto custom-scrollbar p-4 space-y-4">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs px-3.5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Top Tablet Info Banner */}
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">{device.name}</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                Android 14 (Device Owner)
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Serial: <strong className="text-slate-200">{device.serialNumber || device.id}</strong> • IP: <strong className="text-slate-200">{device.ipAddress}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenRemoteViewer}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-emerald-950 flex items-center gap-1.5 transition active:scale-95"
            title="Launch live interactive VNC remote control session"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Open Remote View</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
          <button
            onClick={loadData}
            disabled={loadingStaged}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStaged ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* MediaProjection & ADB Provisioning Assistant Card */}
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-[#0f1626] px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Android Unattended Remote Setup (MediaProjection & ADB)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {isDroidVncInstalled ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>DroidVNC Service Active</span>
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Setup Pending</span>
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3.5">
          <p className="text-xs text-slate-300 leading-relaxed">
            Android strictly requires <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded font-mono">PROJECT_MEDIA</code> and <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded font-mono">SYSTEM_ALERT_WINDOW</code> permission grants so technicians can view and control the screen without prompting a user to accept a confirmation dialog on the tablet.
          </p>

          {/* ADB Command Code Box */}
          <div className="relative group">
            <div className="bg-[#05070d] border border-slate-800/80 rounded-lg p-3 font-mono text-[11px] text-emerald-300 leading-relaxed overflow-x-auto custom-scrollbar pr-28 select-all">
              {adbOneLiner}
            </div>
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              <button
                onClick={handleCopyCommand}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-[11px] font-semibold border border-slate-700 flex items-center gap-1 transition shadow"
              >
                {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Script Download & Execution Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={api.mdm.getAllowMediaBatUrl()}
              download="allowmedia.bat"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition shadow"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download allowmedia.bat (Windows)</span>
            </a>

            <a
              href={api.mdm.getAllowMediaShUrl()}
              download="allowmedia.sh"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition shadow"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download allowmedia.sh (macOS/Linux)</span>
            </a>

            <button
              onClick={handleRunAllowMedia}
              disabled={isRunningAdb}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow shadow-emerald-950 active:scale-95"
            >
              <Play className={`w-3.5 h-3.5 ${isRunningAdb ? 'animate-spin' : ''}`} />
              <span>{isRunningAdb ? 'Executing ADB…' : 'Run ADB Script via Server'}</span>
            </button>

            <button
              onClick={() => triggerAction('restart-vnc', 'Restart DroidVNC', () => api.mdm.runApp(device.id, 'net.christianbeier.droidvnc_ng'))}
              disabled={actionLoading === 'restart-vnc'}
              className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 rounded-lg text-xs font-semibold border border-indigo-800/60 flex items-center gap-1.5 transition"
            >
              <RotateCw className={`w-3.5 h-3.5 ${actionLoading === 'restart-vnc' ? 'animate-spin' : ''}`} />
              <span>Restart DroidVNC Service</span>
            </button>
          </div>

          {/* ADB Server Status Notice */}
          {adbServerStatus && (
            <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1">
              <span className={`w-2 h-2 rounded-full ${adbServerStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>
                Server Host ADB Status:{' '}
                <strong className={adbServerStatus.connected ? 'text-emerald-300' : 'text-amber-300'}>
                  {adbServerStatus.connected ? 'USB Tablet Detected' : 'No direct USB attached (run locally via .bat)'}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* MDM Remote Fleet Actions & Staged App Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Fleet Actions */}
        <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">MDM Quick Actions</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => triggerAction('sync', 'Sync MDM Policy', () => api.mdm.syncTablet(device.id))}
              disabled={actionLoading === 'sync'}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${actionLoading === 'sync' ? 'animate-spin' : ''}`} />
              <div className="text-left">
                <div className="font-semibold text-white">Sync Policy</div>
                <div className="text-[10px] text-slate-500">Push MDM settings</div>
              </div>
            </button>

            <button
              onClick={() => triggerAction('relaunch-kiosk', 'Relaunch Kiosk', () => api.mdm.runApp(device.id, 'app.apexmsp.kiosk'))}
              disabled={actionLoading === 'relaunch-kiosk'}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 flex items-center gap-2 transition"
            >
              <Smartphone className={`w-3.5 h-3.5 text-emerald-400 ${actionLoading === 'relaunch-kiosk' ? 'animate-spin' : ''}`} />
              <div className="text-left">
                <div className="font-semibold text-white">Relaunch Kiosk</div>
                <div className="text-[10px] text-slate-500">Bring to foreground</div>
              </div>
            </button>

            <button
              onClick={() => triggerAction('reboot', 'Reboot Tablet', () => api.mdm.rebootTablet(device.id))}
              disabled={actionLoading === 'reboot'}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-rose-300 rounded-lg border border-slate-800 flex items-center gap-2 transition"
            >
              <RotateCw className={`w-3.5 h-3.5 text-rose-400 ${actionLoading === 'reboot' ? 'animate-spin' : ''}`} />
              <div className="text-left">
                <div className="font-semibold text-rose-200">Reboot Tablet</div>
                <div className="text-[10px] text-slate-500">Restart OS hardware</div>
              </div>
            </button>

            <button
              onClick={() => triggerAction('toggle-kiosk', 'Toggle Kiosk Mode', () => api.mdm.setKiosk(device.id, false))}
              disabled={actionLoading === 'toggle-kiosk'}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 flex items-center gap-2 transition"
            >
              <Unlock className={`w-3.5 h-3.5 text-amber-400 ${actionLoading === 'toggle-kiosk' ? 'animate-spin' : ''}`} />
              <div className="text-left">
                <div className="font-semibold text-white">Unlock Admin</div>
                <div className="text-[10px] text-slate-500">Exit kiosk to recovery</div>
              </div>
            </button>
          </div>
        </div>

        {/* Staged Applications on this Tablet */}
        <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Staged Applications</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {stagedStatuses.length} package{stagedStatuses.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-2">
            {stagedStatuses.length === 0 ? (
              <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800 text-xs text-slate-400 text-center">
                Loading staged packages…
              </div>
            ) : (
              stagedStatuses.map((st) => (
                <div
                  key={st.appId}
                  className="p-2.5 bg-[#070a12] border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                      <Package className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-100">{st.appName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Status:{' '}
                        <span
                          className={`font-semibold ${
                            st.status === 'installed'
                              ? 'text-emerald-400'
                              : st.status === 'queued'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {st.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeployStagedApp(st.appId, st.appName)}
                    disabled={actionLoading === `deploy-${st.appId}`}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold border border-slate-700 flex items-center gap-1 transition"
                  >
                    <Play className="w-3 h-3 text-emerald-400" />
                    <span>{st.status === 'installed' ? 'Re-run' : 'Deploy'}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Interactive ADB Console & Output */}
      <div className="bg-[#0b101c] border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Interactive ADB Console</h3>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-500">Presets:</span>
            <button
              onClick={() => handleRunCustomAdb('dumpsys battery')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[10px]"
            >
              Battery
            </button>
            <button
              onClick={() => handleRunCustomAdb('pm list packages -3')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[10px]"
            >
              Apps
            </button>
            <button
              onClick={() => handleRunCustomAdb('appops get net.christianbeier.droidvnc_ng PROJECT_MEDIA')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[10px]"
            >
              MediaPerm
            </button>
            <button
              onClick={() => handleRunCustomAdb('uptime')}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[10px]"
            >
              Uptime
            </button>
          </div>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-xs select-none">$ adb shell</span>
            <input
              type="text"
              value={customAdbCmd}
              onChange={(e) => setCustomAdbCmd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunCustomAdb()}
              placeholder="e.g. dumpsys battery or getprop"
              className="w-full bg-[#05070d] border border-slate-800 rounded-lg pl-28 pr-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition"
            />
          </div>
          <button
            onClick={() => handleRunCustomAdb()}
            disabled={isRunningAdb || !customAdbCmd.trim()}
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow"
          >
            <Play className={`w-3.5 h-3.5 ${isRunningAdb ? 'animate-spin' : ''}`} />
            <span>Execute</span>
          </button>
        </div>

        {/* Console Output Screen */}
        {(adbOutput || adbError) && (
          <div className="bg-[#04060a] border border-slate-800/90 rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto custom-scrollbar">
            {adbOutput && <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed">{adbOutput}</pre>}
            {adbError && <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed mt-2">{adbError}</pre>}
          </div>
        )}
      </div>
    </div>
  );
};
