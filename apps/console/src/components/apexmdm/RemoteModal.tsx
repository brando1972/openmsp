import React, { useState } from 'react';
import type { MdmDevice } from '@openmsp/api-types';
import { X, Sparkles, RefreshCw, Volume2, RotateCcw, AlertOctagon, Smartphone } from 'lucide-react';
import { apexMdm } from '../../services/api';

interface RemoteModalProps {
  device: MdmDevice;
  onClose: () => void;
  onTriggerToast: (msg: string) => void;
}

export const RemoteModal: React.FC<RemoteModalProps> = ({ device, onClose, onTriggerToast }) => {
  const [tab, setTab] = useState<'controls' | 'logcat'>('controls');
  const [showAiDiagnosis, setShowAiDiagnosis] = useState(false);

  const handleCommand = async (type: string, payload?: any) => {
    try {
      await apexMdm.sendCommand(device.id, type, payload);
      onTriggerToast(`Dispatched command: ${type}`);
    } catch {
      onTriggerToast(`Error sending ${type}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full h-[640px] flex overflow-hidden shadow-2xl">
        {/* Left Side: Interactive Virtual Screen Canvas */}
        <div className="w-[340px] bg-black p-4 flex flex-col items-center justify-between border-r border-slate-800 shrink-0">
          <div className="text-center w-full">
            <div className="text-xs font-semibold text-slate-300 truncate">{device.name}</div>
            <div className="text-[10px] text-slate-500 font-mono">{device.ipAddress} • Low Latency VNC</div>
          </div>

          {/* Device Frame */}
          <div className="w-[240px] h-[480px] bg-slate-950 rounded-3xl border-4 border-slate-800 relative flex flex-col justify-between overflow-hidden shadow-2xl">
            {/* Top camera punchhole */}
            <div className="w-full h-5 flex justify-center items-center bg-black/40 z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
            </div>

            {/* Screen Content Viewport */}
            <div className="flex-1 bg-slate-900 flex flex-col items-center justify-center p-3 text-center space-y-3 relative select-none">
              <div className="w-12 h-12 rounded-xl bg-fuchsia-600/20 text-fuchsia-400 flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{device.activeAppName || 'WMS Scanner'}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {device.activeAppPackage || 'com.apexmsp.wms'}
                </div>
              </div>
              <div className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Live Interactive Feed (30 FPS)
              </div>
            </div>

            {/* Bottom Virtual Android Softkeys */}
            <div className="w-full h-8 bg-black/60 flex items-center justify-around border-t border-slate-800/80 px-4">
              <button
                onClick={() => handleCommand('key_back')}
                className="text-slate-400 hover:text-white text-xs px-2"
                title="Back"
              >
                ◀
              </button>
              <button
                onClick={() => handleCommand('key_home')}
                className="text-slate-400 hover:text-white text-xs px-2"
                title="Home"
              >
                ●
              </button>
              <button
                onClick={() => handleCommand('key_recents')}
                className="text-slate-400 hover:text-white text-xs px-2"
                title="Recent Apps"
              >
                ■
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-500">
            Click directly on screen to inject touch events
          </div>
        </div>

        {/* Right Side: Diagnostics & Control Hub */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTab('controls')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  tab === 'controls'
                    ? 'bg-fuchsia-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Quick Actions
              </button>
              <button
                onClick={() => setTab('logcat')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  tab === 'logcat'
                    ? 'bg-fuchsia-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Logcat & Crash Logs
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {tab === 'controls' ? (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Instant Fleet Commands
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleCommand('reboot')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <RefreshCw className="w-4 h-4 text-sky-400" />
                      Reboot OS
                    </div>
                    <p className="text-[11px] text-slate-400">Graceful reboot sequence</p>
                  </button>

                  <button
                    onClick={() => handleCommand('ring')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <Volume2 className="w-4 h-4 text-amber-400" />
                      Sound Alarm
                    </div>
                    <p className="text-[11px] text-slate-400">Locate misplaced tablet</p>
                  </button>

                  <button
                    onClick={() => handleCommand('exitKiosk')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <RotateCcw className="w-4 h-4 text-purple-400" />
                      Unlock Kiosk
                    </div>
                    <p className="text-[11px] text-slate-400">Exit LockTask mode for 10 min</p>
                  </button>

                  <button
                    onClick={() => handleCommand('lock')}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <AlertOctagon className="w-4 h-4 text-rose-400" />
                      Emergency Lock
                    </div>
                    <p className="text-[11px] text-slate-400">Lock pin immediately</p>
                  </button>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-300">Device Telemetry</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="text-slate-400">Battery Health: <span className="text-white font-medium">{device.batteryHealthPercent}%</span></div>
                    <div className="text-slate-400">Charge Cycles: <span className="text-white font-medium">{device.chargeCycles}</span></div>
                    <div className="text-slate-400">Battery Temp: <span className="text-white font-medium">{device.batteryTempC}°C</span></div>
                    <div className="text-slate-400">Watchdog Restarts: <span className="text-emerald-400 font-medium">{device.watchdogCrashesPrevented}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Real-Time Logcat Crash Buffer
                  </h4>
                  <button
                    onClick={() => setShowAiDiagnosis(!showAiDiagnosis)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Auto-Diagnose Crash
                  </button>
                </div>

                {showAiDiagnosis && (
                  <div className="p-3.5 rounded-xl bg-fuchsia-950/40 border border-fuchsia-800/80 text-xs space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 font-bold text-fuchsia-300">
                      <Sparkles className="w-4 h-4 text-fuchsia-400" />
                      AI Diagnostic: NullPointerException in BarcodeScannerService
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      The warehouse application crashed because the Zebra camera driver was unmounted during low-power sleep state.
                    </p>
                    <div className="bg-slate-950 p-2.5 rounded border border-fuchsia-800/40 text-[11px] font-mono text-emerald-400">
                      Recommendation: Enable "Keep Camera Active in LockTask" in policy profile to prevent unmounts.
                    </div>
                  </div>
                )}

                <div className="bg-black/90 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto space-y-1">
                  <div className="text-slate-500">// Logcat filter: package=com.apexmsp.wms level=ERROR</div>
                  <div className="text-rose-400">09-16 19:42:01.120 E/AndroidRuntime: FATAL EXCEPTION: main</div>
                  <div className="text-rose-400">Process: com.apexmsp.wms, PID: 4512</div>
                  <div className="text-amber-300">java.lang.NullPointerException: Attempt to invoke virtual method 'void android.hardware.camera2.CameraDevice.close()' on a null object reference</div>
                  <div className="text-slate-400 pl-4">at com.apexmsp.wms.scanner.ZebraScanner.onPause(ZebraScanner.kt:84)</div>
                  <div className="text-slate-400 pl-4">at androidx.fragment.app.Fragment.performPause(Fragment.java:3109)</div>
                  <div className="text-emerald-400">09-16 19:42:01.125 I/ApexWatchdog: Watchdog detected app crash. Auto-restarting com.apexmsp.wms in LockTask container. (Crash #1 prevented)</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
