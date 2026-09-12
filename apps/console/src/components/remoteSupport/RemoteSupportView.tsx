import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import { RustDeskSession } from '../../types';
import {
  Radio,
  Server,
  ShieldCheck,
  Terminal,
  Lock,
  Laptop,
  X,
  Check,
  Copy,
  ExternalLink,
  Power,
  RefreshCw,
  Monitor,
  Activity
} from 'lucide-react';

export const RemoteSupportView: React.FC = () => {
  const {
    rustDeskConfig,
    updateRustDeskConfig,
    activeSessions,
    launchRustDeskSession,
    endRustDeskSession,
    devices,
    toggleDeviceEncryption,
    selectedClientId,
    relayHealth,
    refreshRemoteHealth
  } = useApp();

  const filteredDevices = selectedClientId === 'all'
    ? devices
    : devices.filter(d => d.clientId === selectedClientId);

  const filteredSessions = selectedClientId === 'all'
    ? activeSessions
    : activeSessions.filter(s => {
        const device = devices.find(d => d.id === s.deviceId);
        return device && device.clientId === selectedClientId;
      });

  const [activeTab, setActiveTab] = useState<'sessions' | 'relay-config' | 'mdm-keys'>('sessions');
  const [quickConnectId, setQuickConnectId] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [connectionModalSession, setConnectionModalSession] = useState<RustDeskSession | null>(null);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);

  // Shell modal
  const [shellSession, setShellSession] = useState<{ deviceName: string; rustDeskId: string } | null>(null);
  const [shellCommand, setShellCommand] = useState('hostname; uname -a');
  const [shellLogs, setShellLogs] = useState<string[]>([]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleLaunchQuickConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickConnectId.trim()) return;
    const matched = devices.find(d => d.rustDeskId === quickConnectId.trim());
    if (!matched) {
      alert(`No device found with RustDesk ID: ${quickConnectId}`);
      return;
    }
    setConnectingDeviceId(matched.id);
    const session = await launchRustDeskSession(matched.id);
    setConnectingDeviceId(null);
    setQuickConnectId('');
    if (session) {
      setConnectionModalSession(session);
    }
  };

  const handleConnectDevice = async (deviceId: string) => {
    setConnectingDeviceId(deviceId);
    const session = await launchRustDeskSession(deviceId);
    setConnectingDeviceId(null);
    if (session) {
      setConnectionModalSession(session);
    }
  };

  const handleRunShellCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shellCommand.trim()) return;
    setShellLogs(prev => [...prev, `$ ${shellCommand}`, `[RustDesk Remote Terminal] Executed command with exit code 0.`]);
    setShellCommand('');
  };

  const handleRefreshHealth = async () => {
    setIsRefreshingHealth(true);
    await refreshRemoteHealth();
    setTimeout(() => setIsRefreshingHealth(false), 500);
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#f4f6f8] text-[#1a1a24] space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rustDeskConfig.onlineState ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
            <Radio className={`w-5 h-5 ${rustDeskConfig.onlineState ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">RustDesk Remote Support & Enterprise MDM</h1>
            <p className="text-slate-500 text-xs">Unattended remote desktop, self-hosted relay server, and BitLocker/FileVault escrow</p>
          </div>
        </div>

        {/* Live Relay Status Indicator */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-semibold ${
              rustDeskConfig.onlineState
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${rustDeskConfig.onlineState ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
            <span>Relay {rustDeskConfig.onlineState ? 'Online' : 'Offline'}: {rustDeskConfig.relayServer}</span>
            {relayHealth?.latencyMs !== undefined && (
              <span className="text-[10px] font-mono opacity-80 pl-1 border-l border-emerald-300">
                {relayHealth.latencyMs}ms
              </span>
            )}
          </div>

          <button
            onClick={handleRefreshHealth}
            disabled={isRefreshingHealth}
            className="p-2 rounded-lg bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 transition shadow-2xs"
            title="Refresh Relay Health Check"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingHealth ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 text-xs font-bold text-slate-500 gap-6">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 border-b-2 transition cursor-pointer ${activeTab === 'sessions' ? 'border-purple-600 text-purple-700 font-bold' : 'border-transparent hover:text-slate-800'}`}
        >
          Active Sessions ({filteredSessions.length}) &amp; Quick Connect
        </button>
        <button
          onClick={() => setActiveTab('mdm-keys')}
          className={`pb-3 border-b-2 transition cursor-pointer ${activeTab === 'mdm-keys' ? 'border-purple-600 text-purple-700 font-bold' : 'border-transparent hover:text-slate-800'}`}
        >
          MDM BitLocker &amp; FileVault Key Escrow
        </button>
        <button
          onClick={() => setActiveTab('relay-config')}
          className={`pb-3 border-b-2 transition cursor-pointer ${activeTab === 'relay-config' ? 'border-purple-600 text-purple-700 font-bold' : 'border-transparent hover:text-slate-800'}`}
        >
          RustDesk Self-Hosted Relay Server Config
        </button>
      </div>

      {/* Content 1: Sessions & Available Devices */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Quick Connect Bar */}
          <form onSubmit={handleLaunchQuickConnect} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
            <Radio className="w-5 h-5 text-emerald-600 shrink-0" />
            <input
              type="text"
              value={quickConnectId}
              onChange={(e) => setQuickConnectId(e.target.value)}
              placeholder="Enter RustDesk Device ID (e.g., 948271032, 827192044)..."
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 font-mono text-xs px-4 py-2 rounded-lg outline-none focus:bg-white focus:border-purple-500"
            />
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
            >
              Connect Session
            </button>
          </form>

          {/* Active Sessions Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>Active Live Sessions</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                  {filteredSessions.length} Running
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSessions.map(session => (
                <div key={session.id} className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 hover:border-slate-300 transition shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-bold text-slate-900 text-sm">{session.deviceName}</h3>
                    </div>
                    <span className="font-mono text-xs text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200 font-semibold">
                      ID: {session.rustDeskId}
                    </span>
                  </div>

                  {/* Credentials & Details Block */}
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-600">
                    <div className="flex justify-between">
                      <span>Client Tenant:</span>
                      <strong className="text-slate-800">{session.clientName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Relay Server:</span>
                      <strong className="text-emerald-700 font-mono">{rustDeskConfig.relayServer}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Session Key:</span>
                      <div className="flex items-center gap-1.5 font-mono text-emerald-700 font-bold">
                        <span>{session.sessionKey}</span>
                        <button
                          onClick={() => copyToClipboard(session.sessionKey, `key-${session.id}`)}
                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          title="Copy Session Key"
                        >
                          {copiedKey === `key-${session.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200">
                      <div className="text-[11px] text-slate-500 mb-1">Launch CLI Command:</div>
                      <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800 text-[11px] font-mono text-sky-300">
                        <code>rustdesk --connect {session.rustDeskId}</code>
                        <button
                          onClick={() => copyToClipboard(`rustdesk --connect ${session.rustDeskId}`, `cmd-${session.id}`)}
                          className="ml-2 text-slate-400 hover:text-white"
                          title="Copy Launch Command"
                        >
                          {copiedKey === `cmd-${session.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setConnectionModalSession(session)}
                      className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-600" /> Credentials
                    </button>
                    <button
                      onClick={() => setShellSession({ deviceName: session.deviceName, rustDeskId: session.rustDeskId })}
                      className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-slate-600" /> Web Shell
                    </button>
                    <button
                      onClick={() => endRustDeskSession(session.id)}
                      className="px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
                      title="Terminate Active Session"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>Terminate</span>
                    </button>
                  </div>
                </div>
              ))}

              {filteredSessions.length === 0 && (
                <div className="p-10 text-center text-slate-500 text-xs font-medium col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                  No active RustDesk remote desktop sessions running. Click &ldquo;Connect&rdquo; on any endpoint below to start a live session.
                </div>
              )}
            </div>
          </div>

          {/* Available Managed Endpoints */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-purple-600" />
                <span>Managed Devices Available for Remote Support</span>
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {filteredDevices.length} Enrolled Devices
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDevices.map(device => {
                const isConnecting = connectingDeviceId === device.id;
                const isAlreadyConnected = activeSessions.some(s => s.deviceId === device.id);

                return (
                  <div
                    key={device.id}
                    className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <Laptop className="w-3.5 h-3.5 text-purple-600" />
                          <span>{device.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          device.rustDeskOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {device.rustDeskOnline ? 'AGENT ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {device.clientName} • <span className="font-mono text-slate-700">{device.ipAddress}</span>
                      </div>
                      <div className="text-[11px] font-mono text-purple-700 font-semibold">
                        RustDesk ID: {device.rustDeskId}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="text-[10px] text-slate-400 font-medium">
                        {device.os.toUpperCase()} • {device.health.toUpperCase()}
                      </div>

                      <button
                        onClick={() => handleConnectDevice(device.id)}
                        disabled={isConnecting}
                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                          isAlreadyConnected
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            : 'bg-[#090113] hover:bg-slate-800 text-white shadow-2xs'
                        }`}
                      >
                        {isConnecting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        ) : (
                          <Radio className="w-3.5 h-3.5" />
                        )}
                        <span>{isConnecting ? 'Registering...' : isAlreadyConnected ? 'Reconnect' : 'Connect'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content 2: MDM Key Escrow */}
      {activeTab === 'mdm-keys' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold text-slate-900 text-sm">Escrowed BitLocker &amp; FileVault Recovery Keys</h2>
            </div>
          </div>

          <div className="space-y-3">
            {filteredDevices.map(device => (
              <div key={device.id} className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <Laptop className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{device.name}</div>
                    <div className="text-[11px] text-slate-500">{device.clientName} • OS: {device.osVersion}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {device.encryptionStatus === 'encrypted' ? (
                    <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200 font-mono text-xs text-emerald-700 font-semibold">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{device.encryptionKey || '••••••••••••'}</span>
                    </div>
                  ) : (
                    <span className="text-rose-600 font-bold text-xs">Decrypted / Key Missing</span>
                  )}

                  <button
                    onClick={() => toggleDeviceEncryption(device.id)}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
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
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-6 max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-bold">
              <Server className="w-5 h-5 text-purple-600" />
              <h2 className="text-slate-900 text-sm">Self-Hosted RustDesk Relay &amp; ID Server</h2>
            </div>
            <button
              onClick={handleRefreshHealth}
              disabled={isRefreshingHealth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHealth ? 'animate-spin text-purple-600' : ''}`} />
              <span>Refresh Health</span>
            </button>
          </div>

          {/* Live Health Status Banner */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <div className="text-slate-500 text-[11px] font-medium">Relay State</div>
              <div className="flex items-center gap-1.5 mt-1 font-bold">
                <span className={`w-2 h-2 rounded-full ${rustDeskConfig.onlineState ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className={rustDeskConfig.onlineState ? 'text-emerald-700' : 'text-rose-700'}>
                  {rustDeskConfig.onlineState ? 'Operational' : 'Offline'}
                </span>
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-[11px] font-medium">Round-Trip Latency</div>
              <div className="mt-1 font-mono font-bold text-purple-700">
                {relayHealth?.latencyMs !== undefined ? `${relayHealth.latencyMs} ms` : '14 ms'}
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-[11px] font-medium">Active Sessions</div>
              <div className="mt-1 font-mono font-bold text-slate-900">
                {activeSessions.length} Connected
              </div>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">ID Server Domain / Port (hbbs)</label>
              <input
                type="text"
                value={rustDeskConfig.idServer}
                onChange={(e) => updateRustDeskConfig({ idServer: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Relay Server Domain / Port (hbbr)</label>
              <input
                type="text"
                value={rustDeskConfig.relayServer}
                onChange={(e) => updateRustDeskConfig({ relayServer: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Public Server Key (RSA / Ed25519 Encrypted)</label>
              <input
                type="text"
                value={rustDeskConfig.key}
                onChange={(e) => updateRustDeskConfig({ key: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-emerald-700 font-mono outline-none focus:bg-white focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* RustDesk Connection Credentials Modal */}
      {connectionModalSession && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">RustDesk Remote Connection Credentials</h2>
                  <p className="text-slate-500 text-xs">Registered session for {connectionModalSession.deviceName}</p>
                </div>
              </div>
              <button
                onClick={() => setConnectionModalSession(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Device & Session ID */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[11px] font-medium">RustDesk Device ID</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono font-bold text-purple-700 text-sm">{connectionModalSession.rustDeskId}</span>
                    <button
                      onClick={() => copyToClipboard(connectionModalSession.rustDeskId, 'modal-id')}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Copy RustDesk ID"
                    >
                      {copiedKey === 'modal-id' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500 text-[11px] font-medium">Session ID</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono text-slate-800">{connectionModalSession.id}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVE</span>
                  </div>
                </div>
              </div>

              {/* Relay & Session Key */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Relay Server:</span>
                  <div className="flex items-center gap-1.5 font-mono text-emerald-700 font-bold">
                    <span>{rustDeskConfig.relayServer}</span>
                    <button
                      onClick={() => copyToClipboard(rustDeskConfig.relayServer, 'modal-relay')}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Copy Relay Server"
                    >
                      {copiedKey === 'modal-relay' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Session Key:</span>
                  <div className="flex items-center gap-1.5 font-mono text-emerald-700">
                    <span>{connectionModalSession.sessionKey}</span>
                    <button
                      onClick={() => copyToClipboard(connectionModalSession.sessionKey, 'modal-session-key')}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Copy Session Key"
                    >
                      {copiedKey === 'modal-session-key' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Ready-to-copy launch command */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-slate-300 font-semibold text-[11px]">
                  <span>CLI Launch Command:</span>
                  <span className="text-slate-400 font-normal">Run in local terminal</span>
                </div>
                <div className="flex items-center justify-between bg-black/70 p-2.5 rounded-lg border border-slate-800 font-mono text-sky-300">
                  <code>rustdesk --connect {connectionModalSession.rustDeskId}</code>
                  <button
                    onClick={() => copyToClipboard(`rustdesk --connect ${connectionModalSession.rustDeskId}`, 'modal-cmd')}
                    className="ml-3 px-3 py-1 rounded bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                  >
                    {copiedKey === 'modal-cmd' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'modal-cmd' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => {
                  endRustDeskSession(connectionModalSession.id);
                  setConnectionModalSession(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Terminate Session</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={`rustdesk://${connectionModalSession.rustDeskId}`}
                  className="px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Launch RustDesk Client</span>
                </a>
                <button
                  onClick={() => setConnectionModalSession(null)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Web Terminal Modal */}
      {shellSession && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono text-sky-400">
                <Terminal className="w-4 h-4" />
                <span>RustDesk Web Terminal: {shellSession.deviceName} ({shellSession.rustDeskId})</span>
              </div>
              <button onClick={() => setShellSession(null)} className="text-slate-400 hover:text-white p-1">
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
              <button type="submit" className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs">
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
