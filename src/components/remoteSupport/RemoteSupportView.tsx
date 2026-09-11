import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  Headphones,
  Radio,
  Server,
  ShieldCheck,
  Key,
  Terminal,
  Lock,
  Unlock,
  Laptop,
  X,
  Check,
  Copy,
  Settings,
  Flame,
  AlertTriangle,
  Play
} from 'lucide-react';

export const RemoteSupportView: React.FC = () => {
  const {
    rustDeskConfig,
    updateRustDeskConfig,
    activeSessions,
    endRustDeskSession,
    devices,
    launchRustDeskSession,
    toggleDeviceEncryption,
    remoteWipeDevice
  } = useApp();

  const [activeTab, setActiveTab] = useState<'sessions' | 'relay-config' | 'mdm-keys'>('sessions');
  const [quickConnectId, setQuickConnectId] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Shell modal
  const [shellSession, setShellSession] = useState<{ deviceName: string; rustDeskId: string } | null>(null);
  const [shellCommand, setShellCommand] = useState('hostname; uname -a');
  const [shellLogs, setShellLogs] = useState<string[]>([]);

  const handleLaunchQuickConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickConnectId.trim()) return;
    const matched = devices.find(d => d.rustDeskId === quickConnectId) || devices[0];
    launchRustDeskSession(matched.id);
    setQuickConnectId('');
  };

  const handleRunShellCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shellCommand.trim()) return;
    setShellLogs(prev => [...prev, `$ ${shellCommand}`, `[RustDesk Remote Terminal] Executed command with exit code 0.`]);
    setShellCommand('');
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">RustDesk Remote Support & Enterprise MDM</h1>
            <p className="text-slate-400 text-xs">Unattended remote desktop, encrypted relay server, and BitLocker/FileVault escrow</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Relay: {rustDeskConfig.relayServer}</span>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-800 text-xs font-bold text-slate-400 gap-4">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 border-b-2 transition ${activeTab === 'sessions' ? 'border-emerald-500 text-emerald-400' : 'border-transparent hover:text-slate-200'}`}
        >
          Active Remote Desktop Sessions ({activeSessions.length})
        </button>
        <button
          onClick={() => setActiveTab('mdm-keys')}
          className={`pb-3 border-b-2 transition ${activeTab === 'mdm-keys' ? 'border-emerald-500 text-emerald-400' : 'border-transparent hover:text-slate-200'}`}
        >
          MDM BitLocker & FileVault Key Escrow
        </button>
        <button
          onClick={() => setActiveTab('relay-config')}
          className={`pb-3 border-b-2 transition ${activeTab === 'relay-config' ? 'border-emerald-500 text-emerald-400' : 'border-transparent hover:text-slate-200'}`}
        >
          RustDesk Self-Hosted Relay Server Config
        </button>
      </div>

      {/* Content 1: Sessions & Quick Launcher */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Quick Connect Bar */}
          <form onSubmit={handleLaunchQuickConnect} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <Radio className="w-5 h-5 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={quickConnectId}
              onChange={(e) => setQuickConnectId(e.target.value)}
              placeholder="Enter RustDesk Device ID (e.g., 829104712)..."
              className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 font-mono text-xs px-4 py-2.5 rounded-xl outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow-lg shadow-emerald-500/20"
            >
              Connect Session
            </button>
          </form>

          {/* Active Sessions List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSessions.map(session => (
              <div key={session.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 hover:border-slate-700 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h3 className="font-bold text-slate-100 text-sm">{session.deviceName}</h3>
                  </div>
                  <span className="font-mono text-xs text-sky-400">RustDesk ID: {session.rustDeskId}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1 text-slate-400">
                  <div>Client: <strong className="text-slate-200">{session.clientName}</strong></div>
                  <div>Technician: <strong className="text-slate-200">{session.connectedTech}</strong></div>
                  <div>Session Key: <strong className="text-emerald-400 font-mono">{session.sessionKey}</strong></div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setShellSession({ deviceName: session.deviceName, rustDeskId: session.rustDeskId })}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Terminal className="w-3.5 h-3.5 text-sky-400" /> Web Terminal
                  </button>
                  <button
                    onClick={() => endRustDeskSession(session.id)}
                    className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 font-bold text-xs transition"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}

            {activeSessions.length === 0 && (
              <div className="p-12 text-center text-slate-500 text-xs font-medium col-span-2">
                No active RustDesk remote support sessions currently running.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content 2: MDM Key Escrow */}
      {activeTab === 'mdm-keys' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="font-bold text-slate-100 text-sm">Escrowed BitLocker & FileVault Recovery Keys</h2>
            </div>
          </div>

          <div className="space-y-3">
            {devices.map(device => (
              <div key={device.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-900">
                    <Laptop className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{device.name}</div>
                    <div className="text-[11px] text-slate-400">{device.clientName} • OS: {device.osVersion}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {device.encryptionKey ? (
                    <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-800 font-mono text-xs text-emerald-400">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{device.encryptionKey}</span>
                    </div>
                  ) : (
                    <span className="text-rose-400 font-bold text-xs">Decrypted / Key Missing</span>
                  )}

                  <button
                    onClick={() => toggleDeviceEncryption(device.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    Toggle Encryption
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content 3: Relay Config */}
      {activeTab === 'relay-config' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <Server className="w-5 h-5" />
            <h2 className="text-slate-100 text-sm">Self-Hosted RustDesk Relay & ID Server</h2>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 font-bold mb-1">ID Server Domain / IP</label>
              <input
                type="text"
                value={rustDeskConfig.idServer}
                onChange={(e) => updateRustDeskConfig({ idServer: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Relay Server Domain</label>
              <input
                type="text"
                value={rustDeskConfig.relayServer}
                onChange={(e) => updateRustDeskConfig({ relayServer: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Public Public Key (Encrypted RSA-2048)</label>
              <input
                type="text"
                value={rustDeskConfig.key}
                onChange={(e) => updateRustDeskConfig({ key: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Web Terminal Modal */}
      {shellSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-black border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono text-sky-400">
                <Terminal className="w-4 h-4" />
                <span>RustDesk Web Terminal: {shellSession.deviceName} ({shellSession.rustDeskId})</span>
              </div>
              <button onClick={() => setShellSession(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 h-64 overflow-y-auto font-mono text-xs text-emerald-400 space-y-2 bg-black custom-scrollbar">
              <div>RustDesk Direct Tunnel Established [ID: {shellSession.rustDeskId}]</div>
              <div>Connected to remote command daemon. Type your PowerShell or Bash commands below.</div>
              {shellLogs.map((log, idx) => (
                <div key={idx} className={log.startsWith('$') ? 'text-sky-300 font-bold' : 'text-slate-300'}>
                  {log}
                </div>
              ))}
            </div>

            <form onSubmit={handleRunShellCommand} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <span className="font-mono text-xs text-sky-400">$</span>
              <input
                type="text"
                value={shellCommand}
                onChange={(e) => setShellCommand(e.target.value)}
                placeholder="Type remote terminal command..."
                className="flex-1 bg-transparent text-slate-100 font-mono text-xs outline-none"
              />
              <button type="submit" className="px-3 py-1 rounded bg-sky-600 text-white font-bold text-xs">
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
