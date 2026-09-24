import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  ManagedDevice,
  DeviceOS,
  DeviceHealth
} from '../../types';
import {
  UserPlus,
  User,
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
  Flame,
  ChevronDown,
  Maximize2,
  Minimize2,
  Smartphone,
  ExternalLink,
  Package,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { createEnrollmentToken, API_BASE, stagedApps as stagedAppsApi, type DeviceStagedAppStatus, api } from '../../services/api';
import { ManagedTabletsView } from './ManagedTabletsView';
import { DeviceTerminal } from './DeviceTerminal';
import { BackstageHub } from './backstage';

export const RMMView: React.FC = () => {
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    clients,
    selectedClientId,
    setSelectedClientId,
    activeSubRailView,
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

  const [activeTabDrawer, setActiveTabDrawer] = useState<'metrics' | 'backstage' | 'terminal' | 'software' | 'services' | 'logs'>('metrics');
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [terminalScript, setTerminalScript] = useState('Get-Process | Sort-Object CPU -Descending | Select-Object -First 5');
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);

  // Staged Applications State in Drawer
  const [softwareSubTab, setSoftwareSubTab] = useState<'inventory' | 'staged'>('staged');
  const [deviceStagedStatus, setDeviceStagedStatus] = useState<DeviceStagedAppStatus[]>([]);
  const [loadingStaged, setLoadingStaged] = useState(false);
  const [deployingAppId, setDeployingAppId] = useState<string | null>(null);

  const loadDeviceStagedApps = async (deviceId: string) => {
    setLoadingStaged(true);
    try {
      const statuses = await stagedAppsApi.getDeviceStatus(deviceId);
      setDeviceStagedStatus(statuses);
    } catch (e) {
      console.error('Failed to load device staged apps:', e);
    } finally {
      setLoadingStaged(false);
    }
  };

  const handleDeployStagedToDevice = async (appId: string, deviceId: string) => {
    setDeployingAppId(appId);
    try {
      await stagedAppsApi.deployToDevice(appId, deviceId);
      await loadDeviceStagedApps(deviceId);
    } catch (e: any) {
      alert(`Deploy failed: ${e.message}`);
    } finally {
      setDeployingAppId(null);
    }
  };

  // Agent Enrollment Modal
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollClient, setEnrollClient] = useState<string>('');
  const [enrollToken, setEnrollToken] = useState<string>('demo-enrollment-token-2026');
  const [enrollMethod, setEnrollMethod] = useState<'macos' | 'windows' | 'binary'>('macos');
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleGenerateToken = async (targetClientId?: string) => {
    setIsGeneratingToken(true);
    const cId = targetClientId || enrollClient || (selectedClientId !== 'all' ? selectedClientId : clients[0]?.id) || 'c-acme-corp';
    const tokenObj = await createEnrollmentToken(cId, 'HQ Site', 30);
    if (tokenObj && tokenObj.token) {
      setEnrollToken(tokenObj.token);
    } else {
      setEnrollToken(`tok-${Math.random().toString(36).substring(2, 14)}`);
    }
    setIsGeneratingToken(false);
  };

  const handleOpenEnrollModal = () => {
    const cId = (selectedClientId !== 'all' ? selectedClientId : clients[0]?.id) || 'c-acme-corp';
    setEnrollClient(cId);
    handleGenerateToken(cId);
    setShowEnrollModal(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(label);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  // Filtered Devices
  const filteredDevices = devices.filter(d => {
    if (selectedClientId !== 'all' && d.clientId !== selectedClientId) return false;
    if (activeSubRailView === 'windows' && d.os !== 'windows') return false;
    if (activeSubRailView === 'macos' && d.os !== 'macos') return false;
    if (activeSubRailView === 'servers' && d.os !== 'linux') return false;
    if (activeSubRailView === 'critical' && d.health !== 'critical') return false;
    if (filterOS !== 'all' && d.os !== filterOS) return false;
    if (filterHealth !== 'all' && d.health !== filterHealth) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.hostname.toLowerCase().includes(q) || d.ipAddress.includes(q);
    }
    return true;
  });

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  React.useEffect(() => {
    if (selectedDevice?.id && activeTabDrawer === 'software') {
      loadDeviceStagedApps(selectedDevice.id);
    }
  }, [selectedDevice?.id, activeTabDrawer]);

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
      case 'android': return <Smartphone className="w-4 h-4 text-emerald-500" />;
      case 'ios': return <Smartphone className="w-4 h-4 text-indigo-500" />;
      default: return <Monitor className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleConnectDevice = async (device: ManagedDevice) => {
    if (device.os === 'android') {
      try {
        const res = await api.mdm.getViewerUrl(device.id || 'bdf535e319cf5501');
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } catch {
        window.open('https://vnc.apexmsp.app/?device=bdf535e319cf5501', '_blank', 'noopener,noreferrer');
      }
    } else {
      launchRustDeskSession(device.id);
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

  const apiBase = API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  const macOSCommand = `curl -fsSL ${apiBase}/api/v1/installers/script?token=${enrollToken}&os=macos | bash`;
  const windowsCommand = `irm ${apiBase}/api/v1/installers/script?token=${enrollToken}&os=windows | iex`;
  const binaryCommand = `./openmsp-agent --server=${apiBase} --token=${enrollToken}`;

  // Managed Tablets (Android MDM / kiosk fleet) — live from the VNC relay
  if (activeSubRailView === 'mdm-tablets') {
    return <ManagedTabletsView />;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">
      {/* SuperOps Action Toolbar */}
      <div className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm">
        {/* Left: Title + Scope */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-500 bg-slate-50">
            <Monitor className="w-4 h-4" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-[#212b36] tracking-tight flex items-center gap-1.5">
            <span>
              {activeSubRailView === 'windows' ? 'Windows Endpoints' :
               activeSubRailView === 'macos' ? 'Apple macOS Endpoints' :
               activeSubRailView === 'servers' ? 'Server Infrastructure' :
               activeSubRailView === 'critical' ? 'Critical Alerts' : 'Endpoints'}
            </span>
            <span className="text-slate-400 text-sm font-normal">🌐</span>
          </h1>
          <span className="text-xs text-slate-500 font-medium ml-1">
            ({filteredDevices.length})
          </span>
        </div>

        {/* Right: Action Buttons (SuperOps Toolbar) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
          {/* Import / Export Dropdown - hidden on small mobile */}
          <button
            onClick={() => alert('Exporting endpoints as CSV report...')}
            className="hidden sm:flex border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded items-center gap-1.5 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Import / Export</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Download Agent Button */}
          <button
            onClick={handleOpenEnrollModal}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold px-2.5 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5 text-pink-600" />
            <span className="hidden xs:inline">Download Agent</span>
            <span className="xs:hidden">Agent</span>
          </button>

          {/* Filter Trigger */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-xs px-2.5 py-1.5 rounded w-28 sm:w-36 focus:w-44 transition-all outline-none"
            />
          </div>

          {/* SuperOps Primary Dark Action Button */}
          <button
            onClick={handleOpenEnrollModal}
            className="bg-[#090113] hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Asset</span>
          </button>
        </div>
      </div>

      {/* Main RMM Body: SuperOps Table & Detail Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left: Devices Container (Mobile Cards + Desktop Table) */}
        <div className="flex-1 overflow-auto bg-white custom-scrollbar border-r border-slate-200 pb-20 md:pb-0">
          {/* Mobile Card List (md:hidden) */}
          <div className="block md:hidden p-3 space-y-2.5">
            {filteredDevices.map(device => {
              const isSelected = device.id === selectedDeviceId;
              const isOnline = device.health !== 'offline';

              return (
                <div
                  key={device.id}
                  onClick={() => setSelectedDeviceId(device.id)}
                  className={`p-3.5 rounded-xl border bg-white shadow-xs transition active:scale-[0.99] cursor-pointer ${
                    isSelected ? 'border-[#011fff] ring-2 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                        {getOsIcon(device.os)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">
                          {device.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {device.clientName} • {device.siteName || 'Headquarters'}
                          {device.loggedInUser && ` • ${device.loggedInUser}`}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isOnline ? 'bg-[#c8e6c5] text-[#1c4419]' : 'bg-[#ececec] text-[#444444]'
                      }`}
                    >
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono">
                    <div>
                      <span className="text-slate-400 font-sans text-[10px] block">IP ADDRESS</span>
                      <span className="truncate block">{device.ipAddress}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans text-[10px] block">SERIAL</span>
                      <span className="truncate block">{device.serialNumber || 'K4R17CLX2R'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">
                      {device.osVersion || device.os}
                    </span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleConnectDevice(device)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-xs transition"
                      >
                        {device.os === 'android' ? <Smartphone className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                        <span>{device.os === 'android' ? 'Remote View' : 'Connect'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDeviceId(device.id);
                          setActiveTabDrawer('backstage');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1 shadow-xs transition"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Backstage</span>
                      </button>
                      <button
                        onClick={() => setSelectedDeviceId(device.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredDevices.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <Monitor className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <div className="font-semibold text-slate-700">No endpoints found</div>
                <div className="text-xs text-slate-500 mt-1">Try modifying filter conditions or download agent</div>
              </div>
            )}
          </div>

          {/* Desktop SuperOps Table (hidden md:block) */}
          <div className="hidden md:block">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-[#f9fafb] text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-3 w-8">
                    <input type="checkbox" className="rounded border-slate-300" />
                  </th>
                  <th className="py-3 px-2 w-10"></th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Site Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Serial Number</th>
                  <th className="py-3 px-4">Manufacturer</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Hostname</th>
                  <th className="py-3 px-4">Public IP</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDevices.map(device => {
                  const isSelected = device.id === selectedDeviceId;
                  const isOnline = device.health !== 'offline';

                  return (
                    <tr
                      key={device.id}
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={`hover:bg-blue-50/40 transition cursor-pointer ${
                        isSelected ? 'bg-blue-50/70 font-medium' : ''
                      }`}
                    >
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          {getOsIcon(device.os)}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDeviceId(device.id);
                          }}
                          className="text-[#011fff] hover:underline text-left font-bold"
                        >
                          {device.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{device.clientName}</td>
                      <td className="py-3 px-4 text-slate-500">{device.siteName || 'Headquarters'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                            isOnline
                              ? 'bg-[#c8e6c5] text-[#1c4419]'
                              : 'bg-[#ececec] text-[#444444]'
                          }`}
                        >
                          {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 text-[11px]">
                        {device.loggedInUser ? (
                          <div className="flex items-center gap-1.5 font-semibold">
                            <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[130px]" title={device.loggedInUser}>{device.loggedInUser}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                        {device.serialNumber || 'K4R17CLX2R'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {device.os === 'macos' ? 'Apple Inc.' : 'Dell Inc.'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{device.osVersion || 'Mac16,7'}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">{device.hostname}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">{device.ipAddress}</td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleConnectDevice(device)}
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 transition"
                            title={device.os === 'android' ? 'Open Android Tablet Remote Control' : 'ApexConnect Remote Desktop'}
                          >
                            {device.os === 'android' ? <Smartphone className="w-3 h-3 text-emerald-600" /> : <Radio className="w-3 h-3" />}
                            <span>{device.os === 'android' ? 'Remote View' : 'Connect'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedDeviceId(device.id);
                              setActiveTabDrawer('backstage');
                            }}
                            className="px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-[11px] font-bold flex items-center gap-1 transition"
                            title="ScreenConnect Backstage (Silent SYSTEM Management)"
                          >
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span>Backstage</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredDevices.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-slate-400">
                      <Monitor className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <div className="font-semibold text-slate-700">No endpoints found</div>
                      <div className="text-xs text-slate-500 mt-1">Try modifying filter conditions or download agent</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Selected Device Deep Detail Drawer */}
        {selectedDevice && (
          <div className={`fixed inset-0 z-50 w-full md:relative ${
            isDrawerExpanded
              ? 'md:w-[960px] lg:w-[1140px]'
              : (activeTabDrawer === 'backstage' || activeTabDrawer === 'terminal')
              ? 'md:w-[840px] lg:w-[980px]'
              : 'md:w-[460px]'
          } md:inset-auto md:z-auto bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden shadow-2xl md:shadow-xl transition-all duration-200 animate-fadeIn`}>
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                {getOsIcon(selectedDevice.os)}
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">{selectedDevice.name}</h2>
                  <p className="text-[11px] text-slate-500">{selectedDevice.hostname} • {selectedDevice.ipAddress}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsDrawerExpanded(prev => !prev)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition hidden md:flex items-center gap-1"
                  title={isDrawerExpanded ? 'Collapse drawer width' : 'Expand drawer width'}
                >
                  {isDrawerExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setSelectedDeviceId(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition flex items-center gap-1"
                >
                  <span className="text-xs font-semibold md:hidden">Close</span>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-around gap-2 text-xs">
              <button
                onClick={() => handleConnectDevice(selectedDevice)}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold flex items-center justify-center gap-1.5 transition shadow-xs"
                title={selectedDevice.os === 'android' ? 'Open Android Tablet Remote Control' : 'ApexConnect Remote Desktop'}
              >
                {selectedDevice.os === 'android' ? <Smartphone className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                {selectedDevice.os === 'android' ? 'Remote View' : 'ApexConnect'}
                {selectedDevice.os === 'android' && <ExternalLink className="w-3 h-3 opacity-70" />}
              </button>
              <button
                onClick={() => setActiveTabDrawer('backstage')}
                className={`flex-1 py-2 rounded-lg font-extrabold flex items-center justify-center gap-1.5 transition shadow-xs ${
                  activeTabDrawer === 'backstage'
                    ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                    : 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                }`}
                title="ScreenConnect Backstage (Silent Task Manager, Services, Files, Terminal)"
              >
                <Zap className="w-3.5 h-3.5" /> Backstage
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
                className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center transition"
                title="Trigger Auto-Heal Rule"
              >
                <Zap className="w-3.5 h-3.5" />
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
            <div className="flex border-b border-slate-200 text-xs font-bold text-slate-500 bg-slate-50 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => setActiveTabDrawer('metrics')}
                className={`flex-1 min-w-[70px] py-2.5 text-center border-b-2 transition whitespace-nowrap ${activeTabDrawer === 'metrics' ? 'border-[#011fff] text-[#011fff] bg-white' : 'border-transparent hover:text-slate-900'}`}
              >
                Metrics
              </button>
              <button
                onClick={() => setActiveTabDrawer('backstage')}
                className={`flex-1 min-w-[120px] py-2.5 text-center border-b-2 transition whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  activeTabDrawer === 'backstage'
                    ? 'border-amber-500 text-amber-600 bg-white font-extrabold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>⚡ Backstage</span>
              </button>
              <button
                onClick={() => setActiveTabDrawer('software')}
                className={`flex-1 min-w-[65px] py-2.5 text-center border-b-2 transition whitespace-nowrap ${activeTabDrawer === 'software' ? 'border-[#011fff] text-[#011fff] bg-white' : 'border-transparent hover:text-slate-900'}`}
              >
                Apps
              </button>
              <button
                onClick={() => setActiveTabDrawer('services')}
                className={`flex-1 min-w-[75px] py-2.5 text-center border-b-2 transition whitespace-nowrap ${activeTabDrawer === 'services' ? 'border-[#011fff] text-[#011fff] bg-white' : 'border-transparent hover:text-slate-900'}`}
              >
                Services
              </button>
            </div>

            {/* Drawer Tab Contents */}
            {activeTabDrawer === 'backstage' ? (
              <div className="flex-1 bg-[#06080e] overflow-hidden flex flex-col min-h-0">
                <BackstageHub
                  device={selectedDevice}
                  isExpanded={isDrawerExpanded}
                  onToggleExpand={() => setIsDrawerExpanded(prev => !prev)}
                />
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
                {activeTabDrawer === 'metrics' && (
                  <div className="space-y-4">
                    {/* Gauge Meters */}
                    <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span className="text-slate-600">CPU Load</span>
                          <span className="text-slate-900 font-mono">{selectedDevice.metrics.cpuUsage}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${selectedDevice.metrics.cpuUsage > 85 ? 'bg-rose-500' : 'bg-blue-600'}`}
                            style={{ width: `${selectedDevice.metrics.cpuUsage}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span className="text-slate-600">Memory RAM</span>
                          <span className="text-slate-900 font-mono">{selectedDevice.metrics.ramUsage}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${selectedDevice.metrics.ramUsage > 85 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                            style={{ width: `${selectedDevice.metrics.ramUsage}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold mb-1">
                          <span className="text-slate-600">Disk Storage</span>
                          <span className="text-slate-900 font-mono">{selectedDevice.metrics.diskUsage}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${selectedDevice.metrics.diskUsage > 85 ? 'bg-rose-500' : 'bg-emerald-600'}`}
                            style={{ width: `${selectedDevice.metrics.diskUsage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* System Metadata */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Logged In User:</span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5 font-mono text-[11px]">
                          <User className="w-3.5 h-3.5 text-blue-500" />
                          {selectedDevice.loggedInUser || 'No active user'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Domain / Workgroup:</span>
                        <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">
                          {selectedDevice.domain || 'WORKGROUP'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">OS Version:</span>
                        <span className="font-semibold text-slate-800">{selectedDevice.osVersion}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Serial Number:</span>
                        <span className="font-mono text-slate-700">{selectedDevice.serialNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Encryption:</span>
                        <span className="font-semibold text-emerald-600">{selectedDevice.encryptionStatus.toUpperCase()}</span>
                      </div>
                      {selectedDevice.encryptionKey && (
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 mt-2">
                          <span className="text-[10px] text-slate-600 font-mono">{selectedDevice.encryptionKey}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(selectedDevice.encryptionKey!)}
                            className="text-[#011fff] hover:underline text-[10px] font-bold"
                          >
                            Copy Key
                          </button>
                        </div>
                      )}
                    </div>

                    {/* MDM Security & Remote Wipe Zone */}
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                      <div className="flex items-center gap-2 text-rose-700 font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>MDM Remote Security Zone</span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Issue emergency cryptographic remote wipe or force zero-trust device lock.
                      </p>
                      <button
                        onClick={() => {
                          if (window.confirm(`⚠️ EMERGENCY REMOTE WIPE\n\nThis will permanently wipe device "${selectedDevice.name}" and mark it offline.\n\nThis action cannot be undone.\n\nAre you absolutely sure you want to proceed?`)) {
                            remoteWipeDevice(selectedDevice.id);
                          }
                        }}
                        className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Emergency Remote Wipe Device
                      </button>
                    </div>
                  </div>
                )}

                {activeTabDrawer === 'software' && (
                  <div className="space-y-3">
                    {/* Sub-tab toggle */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                      <button
                        onClick={() => setSoftwareSubTab('staged')}
                        className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition ${
                          softwareSubTab === 'staged'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Staged Packages ({deviceStagedStatus.length})</span>
                      </button>
                      <button
                        onClick={() => setSoftwareSubTab('inventory')}
                        className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition ${
                          softwareSubTab === 'inventory'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>Installed Inventory ({selectedDevice.installedApps.length})</span>
                      </button>
                    </div>

                    {softwareSubTab === 'staged' ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[11px] text-slate-500 font-semibold mb-1">
                          <span>Required & Staged Applications</span>
                          <button
                            onClick={() => loadDeviceStagedApps(selectedDevice.id)}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${loadingStaged ? 'animate-spin' : ''}`} />
                            <span>Refresh</span>
                          </button>
                        </div>

                        {deviceStagedStatus.length === 0 ? (
                          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-slate-500 text-xs">
                            No staged applications found for this operating system.
                          </div>
                        ) : (
                          deviceStagedStatus.map((app) => (
                            <div
                              key={app.appId}
                              className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <Package className="w-3.5 h-3.5 text-blue-500" />
                                    <span>{app.appName}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 capitalize">{app.category.replace('_', ' ')}</div>
                                </div>

                                {/* Status Badge */}
                                {app.status === 'installed' && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Installed
                                  </span>
                                )}
                                {app.status === 'queued' && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-600" /> Queued
                                  </span>
                                )}
                                {app.status === 'installing' && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" /> Installing
                                  </span>
                                )}
                                {app.status === 'failed' && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" /> Failed
                                  </span>
                                )}
                                {app.status === 'not_installed' && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                    Not Installed
                                  </span>
                                )}
                              </div>

                              {app.error && (
                                <div className="text-[10px] font-mono text-rose-600 bg-rose-50 p-1.5 rounded border border-rose-200 break-all">
                                  {app.error}
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-[10px] text-slate-500">
                                <span>Checked: {new Date(app.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <button
                                  disabled={deployingAppId === app.appId}
                                  onClick={() => handleDeployStagedToDevice(app.appId, selectedDevice.id)}
                                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
                                >
                                  {deployingAppId === app.appId ? (
                                    <>
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Dispatching...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-2.5 h-2.5" />
                                      <span>{app.status === 'installed' ? 'Reinstall' : 'Deploy Now'}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="font-bold text-slate-800 mb-2">Installed Application Inventory</div>
                        {selectedDevice.installedApps.map(app => (
                          <div key={app.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                            <div>
                              <div className="font-bold text-slate-800">{app.name}</div>
                              <div className="text-[10px] text-slate-500">{app.publisher}</div>
                            </div>
                            <div className="font-mono text-slate-600 text-[11px]">{app.version}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTabDrawer === 'services' && (
                  <div className="space-y-2">
                    <div className="font-bold text-slate-800 mb-2">System Services Monitor</div>
                    {selectedDevice.services.map(svc => (
                      <div key={svc.name} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-slate-800">{svc.displayName || svc.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{svc.name}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          svc.status === 'running' ? 'bg-[#c8e6c5] text-[#1c4419]' : 'bg-[#ececec] text-[#444444]'
                        }`}>
                          {svc.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enroll New Agent Modal (SuperOps Clean Light Modal) */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl text-slate-900 animate-fadeIn max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-pink-50 text-pink-600">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Download Agent — One-Liner Installer</h2>
                  <p className="text-slate-500 text-xs">Deploy cross-platform Go agent to macOS, Windows, or Linux</p>
                </div>
              </div>
              <button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Client Tenant & Token Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Target Client Organization</label>
                <select
                  value={enrollClient}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setEnrollClient(nextId);
                    handleGenerateToken(nextId);
                  }}
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs outline-none focus:border-blue-500 cursor-pointer"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.totalDevices} Devices)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
                  <span>Enrollment Token</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Expires in 30 days</span>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-2 rounded-xl">
                  <span className="font-mono text-xs text-sky-300 truncate flex-1">{enrollToken}</span>
                  <button
                    onClick={() => handleGenerateToken()}
                    disabled={isGeneratingToken}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 transition"
                    title="Generate Fresh Enrollment Token"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGeneratingToken ? 'animate-spin text-sky-400' : ''}`} />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Platform Selection Tabs */}
            <div className="flex gap-2 border-b border-slate-200 pb-3 text-xs font-bold">
              <button
                onClick={() => setEnrollMethod('macos')}
                className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 border transition cursor-pointer ${
                  enrollMethod === 'macos'
                    ? 'bg-purple-50 border-purple-500 text-purple-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>macOS (curl | bash)</span>
              </button>

              <button
                onClick={() => setEnrollMethod('windows')}
                className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 border transition cursor-pointer ${
                  enrollMethod === 'windows'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>Windows (irm | iex)</span>
              </button>

              <button
                onClick={() => setEnrollMethod('binary')}
                className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 border transition cursor-pointer ${
                  enrollMethod === 'binary'
                    ? 'bg-amber-50 border-amber-500 text-amber-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Direct Agent Binary</span>
              </button>
            </div>

            {/* Active Command Box */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700">Ready-to-Run Command:</span>
                <span className="text-[11px] text-slate-500">Click button or copy command</span>
              </div>

              <div className="relative">
                <pre className="p-4 pr-24 rounded-lg bg-slate-900 border border-slate-800 text-sky-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {enrollMethod === 'macos' && macOSCommand}
                  {enrollMethod === 'windows' && windowsCommand}
                  {enrollMethod === 'binary' && binaryCommand}
                </pre>

                <button
                  onClick={() => {
                    const cmd = enrollMethod === 'macos' ? macOSCommand : enrollMethod === 'windows' ? windowsCommand : binaryCommand;
                    copyToClipboard(cmd, `cmd-${enrollMethod}`);
                  }}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-md bg-[#090113] hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  {copiedCmd === `cmd-${enrollMethod}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd === `cmd-${enrollMethod}` ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              {/* Direct Binary Download Option */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`${apiBase}/api/v1/installers/download?os=macos`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download macOS Agent (Universal M1-M4 & Intel)</span>
                </a>
                <a
                  href={`${apiBase}/api/v1/installers/download?os=windows`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Windows Agent (.exe)</span>
                </a>
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  <span>Installation Instructions:</span>
                </div>
                {enrollMethod === 'macos' && (
                  <p>
                    Open Terminal on the target Mac and run with administrative privileges (<code className="text-blue-700 font-mono">sudo bash</code>). The installer script securely registers the hardware serial number &amp; MAC address, escrows FileVault keys, and begins 30-second telemetry heartbeats.
                  </p>
                )}
                {enrollMethod === 'windows' && (
                  <p>
                    Open an elevated Administrator PowerShell prompt (<code className="text-blue-700 font-mono">Run as Administrator</code>) and paste the one-liner. It downloads the ApexMSP agent binary, initiates 30-second telemetry heartbeats, and activates the Shark Fin tray app in your taskbar.
                  </p>
                )}
                {enrollMethod === 'binary' && (
                  <p>
                    Run the compiled Go agent binary directly from terminal or schedule as a launchd daemon / Windows Service. For Linux servers, containers, or direct executable execution without shell wrappers, execute the precompiled <code className="text-blue-700 font-mono">openmsp-agent</code> binary directly specifying your API server and enrollment token.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowEnrollModal(false)}
                className="px-4 py-2 rounded-lg bg-[#090113] text-white font-medium text-xs hover:bg-slate-800 shadow-sm transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
