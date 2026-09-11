import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  ManagedDevice,
  DeviceOS,
  DeviceHealth
} from '../../types';
import {
  Monitor,
  Search,
  Filter,
  Laptop,
  Server,
  HardDrive,
  Radio,
  Play,
  Terminal,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Download,
  X,
  Activity,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  Flame
} from 'lucide-react';

export const RMMView: React.FC = () => {
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    clients,
    selectedClientId,
    setSelectedClientId,
    runRemoteScriptOnDevice,
    toggleDeviceEncryption,
    remoteWipeDevice,
    launchRustDeskSession,
    triggerAutomationRuleDryRun,
    automations
  } = useApp();

  const findMatchingRule = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return null;
    const deviceOs = device.os === 'windows' ? 'windows' : device.os === 'macos' ? 'macos' : device.os;
    return automations.find(rule => 
      rule.enabled && (rule.osTarget === 'all' || rule.osTarget === deviceOs)
    );
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOS, setFilterOS] = useState<DeviceOS | 'all'>('all');
  const [filterHealth, setFilterHealth] = useState<DeviceHealth | 'all'>('all');

  // Interactive Drawer State
  const [activeTabDrawer, setActiveTabDrawer] = useState<'metrics' | 'terminal' | 'software' | 'services' | 'logs'>('metrics');
  const [terminalScript, setTerminalScript] = useState('Get-Process | Sort-Object CPU -Descending | Select-Object -First 5');
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);

  // Agent Deployment Modal
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployOS, setDeployOS] = useState<'windows' | 'macos'>('windows');
  const [copiedScript, setCopiedScript] = useState(false);

  // Filtered Devices
  const filteredDevices = devices.filter(d => {
    if (selectedClientId !== 'all' && d.clientId !== selectedClientId) return false;
    if (filterOS !== 'all' && d.os !== filterOS) return false;
    if (filterHealth !== 'all' && d.health !== filterHealth) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.hostname.toLowerCase().includes(q) || d.ipAddress.includes(q);
    }
    return true;
  });

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const handleRunScript = async () => {
    if (!selectedDevice || !terminalScript.trim()) return;
    setIsRunningScript(true);
    setTerminalOutput('Connecting to ApexMSP RMM Agent Daemon...');
    const result = await runRemoteScriptOnDevice(selectedDevice.id, terminalScript);
    setTerminalOutput(result);
    setIsRunningScript(false);
  };

  const getOsIcon = (os: DeviceOS) => {
    switch (os) {
      case 'windows': return <Laptop className="w-4 h-4 text-sky-400" />;
      case 'macos': return <Laptop className="w-4 h-4 text-purple-400" />;
      case 'linux': return <Server className="w-4 h-4 text-amber-400" />;
      case 'network': return <HardDrive className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getHealthBadge = (health: DeviceHealth) => {
    switch (health) {
      case 'healthy': return <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">HEALTHY</span>;
      case 'warning': return <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">WARNING</span>;
      case 'critical': return <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold">CRITICAL</span>;
      case 'offline': return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">OFFLINE</span>;
    }
  };

  const windowsScript = `$TenantID = "apex-tenant-01"
$RelayServer = "rustdesk-relay.apexmsp.io"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "https://agent.apexmsp.io/downloads/ApexAgentSetup.exe" -OutFile "$env:TEMP\\ApexAgentSetup.exe"
Start-Process "$env:TEMP\\ApexAgentSetup.exe" -ArgumentList "/S /Tenant=$TenantID /RustDeskRelay=$RelayServer" -Wait
Write-Host "ApexMSP Agent successfully deployed and registered."`;

  const macOSScript = `#!/bin/bash
TENANT_ID="apex-tenant-01"
RELAY_SERVER="rustdesk-relay.apexmsp.io"
curl -sSL "https://agent.apexmsp.io/downloads/ApexAgentMac.pkg" -o "/tmp/ApexAgentMac.pkg"
sudo installer -pkg "/tmp/ApexAgentMac.pkg" -target /
sudo /Library/Application\\ Support/ApexMSP/bin/apex-daemon --enroll --tenant="$TENANT_ID" --relay="$RELAY_SERVER"
echo "ApexMSP macOS Agent Daemon installed."`;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* RMM Bar Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base">RMM Managed Endpoints</h1>
            <p className="text-slate-400 text-xs">Real-time telemetry, remote PowerShell execution & self-healing</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeployModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-md shadow-sky-600/20"
          >
            <Download className="w-4 h-4" />
            <span>Deploy RMM Agent</span>
          </button>
        </div>
      </div>

      {/* RMM Filter Controls */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by endpoint name, hostname or IP..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 text-slate-100 placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl text-xs outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>OS:</span>
            <select
              value={filterOS}
              onChange={(e) => setFilterOS(e.target.value as DeviceOS | 'all')}
              className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All OS</option>
              <option value="windows" className="bg-slate-900">Windows</option>
              <option value="macos" className="bg-slate-900">macOS</option>
              <option value="linux" className="bg-slate-900">Linux</option>
              <option value="network" className="bg-slate-900">Network / SNMP</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span>Health:</span>
            <select
              value={filterHealth}
              onChange={(e) => setFilterHealth(e.target.value as DeviceHealth | 'all')}
              className="bg-transparent text-slate-200 font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Status</option>
              <option value="healthy" className="bg-slate-900">Healthy</option>
              <option value="warning" className="bg-slate-900">Warning</option>
              <option value="critical" className="bg-slate-900">Critical</option>
              <option value="offline" className="bg-slate-900">Offline</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main RMM Body: Device Grid & Detail Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Device List */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-2">
          {filteredDevices.map(device => {
            const isSelected = device.id === selectedDeviceId;
            return (
              <div
                key={device.id}
                onClick={() => setSelectedDeviceId(device.id)}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-sky-500/10 border-sky-500/50 shadow-md'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    {getOsIcon(device.os)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                      <span>{device.name}</span>
                      {getHealthBadge(device.health)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {device.clientName} • <span className="font-mono text-slate-300">{device.ipAddress}</span>
                    </div>
                  </div>
                </div>

                {/* Telemetry quick gauges */}
                <div className="hidden md:flex items-center gap-6 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold">CPU</div>
                    <div className={`font-mono font-bold ${device.metrics.cpuUsage > 85 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {device.metrics.cpuUsage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold">RAM</div>
                    <div className={`font-mono font-bold ${device.metrics.ramUsage > 85 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {device.metrics.ramUsage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold">DISK</div>
                    <div className={`font-mono font-bold ${device.metrics.diskUsage > 85 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {device.metrics.diskUsage}%
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-4 border-l border-slate-800">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        launchRustDeskSession(device.id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>RustDesk</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredDevices.length === 0 && (
            <div className="p-12 text-center text-slate-500 text-xs font-medium">
              No devices match the selected filters.
            </div>
          )}
        </div>

        {/* Right: Selected Device Deep Detail Drawer */}
        {selectedDevice && (
          <div className="w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                {getOsIcon(selectedDevice.os)}
                <div>
                  <h2 className="font-bold text-slate-100 text-sm">{selectedDevice.name}</h2>
                  <p className="text-[11px] text-slate-400">{selectedDevice.hostname}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDeviceId(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-around gap-2 text-xs">
              <button
                onClick={() => launchRustDeskSession(selectedDevice.id)}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold flex items-center justify-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5" /> RustDesk
              </button>
              <button
                onClick={() => {
                  const matchingRule = findMatchingRule(selectedDevice.id);
                  if (matchingRule) {
                    triggerAutomationRuleDryRun(matchingRule.id, selectedDevice.id);
                  } else {
                    alert(`No compatible auto-heal rule found for ${selectedDevice.name} (${selectedDevice.os})`);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5" /> Auto-Heal
              </button>
              <button
                onClick={() => toggleDeviceEncryption(selectedDevice.id)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Toggle BitLocker/FileVault"
              >
                {selectedDevice.encryptionStatus === 'encrypted' ? <Lock className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-rose-400" />}
              </button>
            </div>

            {/* Tabs Selector */}
            <div className="flex border-b border-slate-800 text-xs font-bold text-slate-400 bg-slate-950/30">
              <button
                onClick={() => setActiveTabDrawer('metrics')}
                className={`flex-1 py-2.5 text-center border-b-2 ${activeTabDrawer === 'metrics' ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent hover:text-slate-200'}`}
              >
                Metrics
              </button>
              <button
                onClick={() => setActiveTabDrawer('terminal')}
                className={`flex-1 py-2.5 text-center border-b-2 ${activeTabDrawer === 'terminal' ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent hover:text-slate-200'}`}
              >
                Terminal
              </button>
              <button
                onClick={() => setActiveTabDrawer('software')}
                className={`flex-1 py-2.5 text-center border-b-2 ${activeTabDrawer === 'software' ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent hover:text-slate-200'}`}
              >
                Apps
              </button>
              <button
                onClick={() => setActiveTabDrawer('services')}
                className={`flex-1 py-2.5 text-center border-b-2 ${activeTabDrawer === 'services' ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-transparent hover:text-slate-200'}`}
              >
                Services
              </button>
            </div>

            {/* Drawer Tab Contents */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              {activeTabDrawer === 'metrics' && (
                <div className="space-y-4">
                  {/* Gauge Meters */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-400">CPU Load</span>
                        <span className="text-slate-200 font-mono">{selectedDevice.metrics.cpuUsage}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${selectedDevice.metrics.cpuUsage > 85 ? 'bg-rose-500' : 'bg-sky-500'}`}
                          style={{ width: `${selectedDevice.metrics.cpuUsage}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-400">Memory RAM</span>
                        <span className="text-slate-200 font-mono">{selectedDevice.metrics.ramUsage}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${selectedDevice.metrics.ramUsage > 85 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          style={{ width: `${selectedDevice.metrics.ramUsage}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-400">Disk Storage</span>
                        <span className="text-slate-200 font-mono">{selectedDevice.metrics.diskUsage}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${selectedDevice.metrics.diskUsage > 85 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${selectedDevice.metrics.diskUsage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* System Metadata */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">OS Version:</span>
                      <span className="font-semibold text-slate-200">{selectedDevice.osVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Serial Number:</span>
                      <span className="font-mono text-slate-300">{selectedDevice.serialNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Encryption:</span>
                      <span className="font-semibold text-emerald-400">{selectedDevice.encryptionStatus.toUpperCase()}</span>
                    </div>
                    {selectedDevice.encryptionKey && (
                      <div className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800 mt-2">
                        <span className="text-[10px] text-slate-400 font-mono">{selectedDevice.encryptionKey}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(selectedDevice.encryptionKey!)}
                          className="text-sky-400 hover:underline text-[10px] font-bold"
                        >
                          Copy Key
                        </button>
                      </div>
                    )}
                  </div>

                  {/* MDM Security & Remote Wipe Zone */}
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>MDM Remote Security Zone</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Issue emergency cryptographic remote wipe or force zero-trust device lock.
                    </p>
                    <button
                      onClick={() => {
                        if (window.confirm(`⚠️ EMERGENCY REMOTE WIPE\n\nThis will permanently wipe device "${selectedDevice.name}" and mark it offline.\n\nThis action cannot be undone.\n\nAre you absolutely sure you want to proceed?`)) {
                          remoteWipeDevice(selectedDevice.id);
                        }
                      }}
                      className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold transition flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Emergency Remote Wipe Device
                    </button>
                  </div>
                </div>
              )}

              {activeTabDrawer === 'terminal' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-sky-400" /> Interactive Script Shell
                    </span>
                    <span className="text-[10px] text-slate-500">PowerShell / Zsh</span>
                  </div>

                  <textarea
                    rows={4}
                    value={terminalScript}
                    onChange={(e) => setTerminalScript(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sky-300 font-mono text-xs outline-none focus:border-sky-500"
                  />

                  <button
                    onClick={handleRunScript}
                    disabled={isRunningScript}
                    className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 transition"
                  >
                    {isRunningScript ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    <span>{isRunningScript ? 'Executing Agent Command...' : 'Run Remote Script'}</span>
                  </button>

                  {terminalOutput && (
                    <div className="p-3 rounded-xl bg-black border border-slate-800 text-emerald-400 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                      {terminalOutput}
                    </div>
                  )}
                </div>
              )}

              {activeTabDrawer === 'software' && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-300 mb-2">Installed Application Inventory</div>
                  {selectedDevice.installedApps.map(app => (
                    <div key={app.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                      <div>
                        <div className="font-bold text-slate-200">{app.name}</div>
                        <div className="text-[10px] text-slate-500">{app.publisher}</div>
                      </div>
                      <div className="font-mono text-slate-400 text-[11px]">{app.version}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTabDrawer === 'services' && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-300 mb-2">System Services Monitor</div>
                  {selectedDevice.services.map((srv, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-200">{srv.displayName}</div>
                        <div className="text-[10px] text-slate-500">{srv.name}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${srv.status === 'running' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {srv.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Agent Deployer Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-sky-400" />
                <h2 className="font-bold text-slate-100 text-base">RMM Agent Deployment Builder</h2>
              </div>
              <button onClick={() => setShowDeployModal(false)} className="text-slate-400 hover:text-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeployOS('windows')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border ${
                  deployOS === 'windows' ? 'bg-sky-500/10 border-sky-500 text-sky-400' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Laptop className="w-4 h-4" /> Windows PowerShell
              </button>
              <button
                onClick={() => setDeployOS('macos')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border ${
                  deployOS === 'macos' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Laptop className="w-4 h-4" /> macOS Terminal Script
              </button>
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-black border border-slate-800 text-sky-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-60">
                {deployOS === 'windows' ? windowsScript : macOSScript}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deployOS === 'windows' ? windowsScript : macOSScript);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 2000);
                }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copied' : 'Copy Script'}</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowDeployModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs hover:bg-slate-700"
              >
                Close Builder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
