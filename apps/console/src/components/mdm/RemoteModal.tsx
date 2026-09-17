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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
        {/* Screen Viewer (Left Side) */}
        <div className="bg-black p-4 flex-1 flex flex-col items-center justify-center relative min-h-[440px]">
          <div className="w-72 h-[460px] bg-slate-950 border-4 border-slate-700 rounded-[32px] p-2.5 relative shadow-inner flex flex-col justify-between overflow-hidden">
            {/* Inner App Display Simulation */}
            <div className="flex-1 bg-slate-900 rounded-xl p-3 flex flex-col justify-between border border-slate-800 relative">
              <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1.5">
                <span className="font-bold text-fuchsia-400">{device.activeAppName}</span>
                <span>📶 {device.wifiRssi} dBm | {device.batteryLevel}% ⚡</span>
              </div>

              <div className="my-auto space-y-2 text-center">
                <div className="text-[11px] text-slate-300 font-semibold uppercase">Scanner Laser Ready</div>
                <div className="w-36 h-12 bg-white rounded flex items-center justify-center mx-auto shadow">
                  <div className="space-x-1 font-mono text-black font-bold text-[10px] tracking-widest">
                    |||||| | ||||| ||
                  </div>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono">BIN-AISLE-4B-08</div>
                <button
                  onClick={() => onTriggerToast('Simulated barcode trigger scan')}
                  className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[10px] font-bold px-3 py-1 rounded shadow"
                >
                  Simulate Trigger
                </button>
              </div>

              <div className="text-[9px] text-slate-500 text-center">
                Locked Task Mode • ApexMDM DPC
              </div>
            </div>

            {/* Soft Android Nav Keys */}
            <div className="flex items-center justify-around py-1 text-slate-500 text-xs">
              <button onClick={() => onTriggerToast('Sent Back key to tablet')} className="hover:text-white" title="Back">
                ◀
              </button>
              <button onClick={() => onTriggerToast('Sent Home key to tablet')} className="hover:text-white" title="Home">
                ●
              </button>
              <button onClick={() => onTriggerToast('Sent Recent Apps key to tablet')} className="hover:text-white" title="Recent Apps">
                ■
              </button>
            </div>
          </div>

          <div className="absolute bottom-3 left-4 text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Live VNC: 60 FPS • 12ms latency
          </div>
        </div>

        {/* Controls & Diagnostics Sidebar (Right Side) */}
        <div className="w-full md:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-5 flex flex-col justify-between text-xs">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-sm">{device.name}</h3>
                <p className="text-[11px] font-mono text-slate-400">{device.serialNumber}</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Diagnostics Tabs */}
            <div className="flex border-b border-slate-800 mt-3 text-xs">
              <button
                onClick={() => setTab('controls')}
                className={`py-1.5 px-3 font-semibold transition ${
                  tab === 'controls'
                    ? 'text-fuchsia-400 border-b-2 border-fuchsia-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Actions & Telemetry
              </button>
              <button
                onClick={() => setTab('logcat')}
                className={`py-1.5 px-3 font-semibold transition ${
                  tab === 'logcat'
                    ? 'text-fuchsia-400 border-b-2 border-fuchsia-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Logcat & AI Diagnosis
              </button>
            </div>

            {/* Tab 1: Actions & Telemetry */}
            {tab === 'controls' && (
              <div className="space-y-4 mt-3">
                <div className="space-y-2">
                  <button
                    onClick={() => handleCommand('reboot')}
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-slate-400" /> Reboot Tablet
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">dpm.reboot()</span>
                  </button>

                  <button
                    onClick={() => handleCommand('alarm')}
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" /> Sound Max Siren
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">playAlarm()</span>
                  </button>

                  <button
                    onClick={() => handleCommand('watchdog_restart')}
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400" /> Watchdog Relaunch App
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">watchdogRestart()</span>
                  </button>

                  <button
                    onClick={() => handleCommand('wipe')}
                    className="w-full py-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900/50 flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-400" /> Remote Factory Wipe
                    </span>
                    <span className="text-rose-400 font-mono text-[10px]">wipeData(0)</span>
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Battery Health:</span>
                    <span className="text-emerald-400 font-medium">{device.batteryHealthPercent}% Capacity</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Charge Cycles:</span>
                    <span>{device.chargeCycles} cycles</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Operating Temp:</span>
                    <span>{device.batteryTempC}° C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">OS Build:</span>
                    <span>{device.osVersion}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Logcat & AI Diagnosis */}
            {tab === 'logcat' && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">Android System Logcat</span>
                  <button
                    onClick={() => {
                      setShowAiDiagnosis(true);
                      onTriggerToast('Apex AI analyzed Android Logcat stack trace!');
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 shadow transition"
                  >
                    <Sparkles className="w-3 h-3" /> Diagnose with Apex AI
                  </button>
                </div>

                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[10px] text-emerald-400/90 h-36 overflow-y-auto leading-tight">
{`09-16 19:40:12.102 E/BluetoothScanner: Connection failed to Zebra ZD420
09-16 19:40:12.105 W/System.err: java.io.IOException: Bluetooth read failed
09-16 19:40:12.106 W/System.err:   at com.apexmsp.wms.bt.Connect(Scanner.kt:84)
09-16 19:40:13.001 I/ApexDPC: Watchdog prevented app freeze, fallback active`}
                </pre>

                {showAiDiagnosis && (
                  <div className="bg-indigo-950/40 border border-indigo-500/40 p-2.5 rounded-lg text-[11px] text-indigo-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-white">
                      <Sparkles className="w-3 h-3 text-indigo-400" /> Apex AI Analysis:
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-300">
                      The scanner app encountered an <span className="text-amber-300 font-mono">IOException</span> because the
                      Bluetooth socket to the Zebra printer closed unexpectedly. The DPC watchdog kept the kiosk responsive.
                    </p>
                    <button
                      onClick={() => onTriggerToast('Sent remote Bluetooth reset signal to tablet')}
                      className="mt-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded font-semibold transition"
                    >
                      Auto-Fix: Restart Bluetooth Stack
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
          >
            Close Session
          </button>
        </div>
      </div>
    </div>
  );
};
