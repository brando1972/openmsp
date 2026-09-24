import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Play,
  RotateCw,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Laptop,
  Monitor,
  Terminal,
  Shield,
  Layers,
  Settings,
  X,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { stagedApps, devices as devicesApi } from '../../services/api';
import type { StagedApp, StagedAppCategory, StagedAppOs, ManagedDevice } from '@openmsp/api-types';

export const StagedAppsView: React.FC = () => {
  const [apps, setApps] = useState<StagedApp[]>([]);
  const [fleetStats, setFleetStats] = useState<any[]>([]);
  const [deviceList, setDeviceList] = useState<ManagedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Edit / Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Partial<StagedApp> | null>(null);

  // Target Device Deploy Modal state
  const [deployModalApp, setDeployModalApp] = useState<StagedApp | null>(null);
  const [selectedTargetDeviceId, setSelectedTargetDeviceId] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [appList, stats, devs] = await Promise.all([
        stagedApps.list(),
        stagedApps.getFleetStatus(),
        devicesApi.getDevices()
      ]);
      setApps(appList);
      setFleetStats(stats);
      setDeviceList(devs);
    } catch (err: any) {
      console.error('Failed to load staged apps:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleAutoDeploy = async (app: StagedApp) => {
    try {
      const updated = await stagedApps.update(app.id, { autoDeploy: !app.autoDeploy });
      setApps(prev => prev.map(a => a.id === app.id ? updated : a));
      setActionMessage(`Auto-deploy ${!app.autoDeploy ? 'enabled' : 'disabled'} for ${app.name}`);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(`Failed to update auto-deploy: ${err.message}`);
    }
  };

  const handleDeployFleet = async (app: StagedApp) => {
    if (!window.confirm(`Deploy "${app.name}" to all eligible devices that do not currently have it installed?`)) {
      return;
    }
    setDeployingId(app.id);
    try {
      const res = await stagedApps.deployFleet(app.id);
      setActionMessage(`Queued deployment to ${res.queuedCount} endpoint(s): ${res.targets.slice(0, 3).join(', ')}${res.targets.length > 3 ? '...' : ''}`);
      setTimeout(() => setActionMessage(null), 4000);
      loadData();
    } catch (err: any) {
      alert(`Fleet deploy failed: ${err.message}`);
    } finally {
      setDeployingId(null);
    }
  };

  const handleDeployToDevice = async () => {
    if (!deployModalApp || !selectedTargetDeviceId) return;
    try {
      await stagedApps.deployToDevice(deployModalApp.id, selectedTargetDeviceId);
      const targetDev = deviceList.find(d => d.id === selectedTargetDeviceId);
      setActionMessage(`Deployment queued for ${targetDev?.name || selectedTargetDeviceId}`);
      setTimeout(() => setActionMessage(null), 3000);
      setDeployModalApp(null);
      setSelectedTargetDeviceId('');
      loadData();
    } catch (err: any) {
      alert(`Deploy to device failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete staged application "${name}"? This removes it from staged catalogs but does not uninstall from endpoints.`)) {
      return;
    }
    try {
      await stagedApps.delete(id);
      setApps(prev => prev.filter(a => a.id !== id));
      setActionMessage(`Staged app "${name}" deleted`);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp || !editingApp.name) return;

    try {
      if (editingApp.id) {
        await stagedApps.update(editingApp.id, editingApp);
        setActionMessage(`Updated ${editingApp.name}`);
      } else {
        await stagedApps.create(editingApp);
        setActionMessage(`Created staged app ${editingApp.name}`);
      }
      setIsModalOpen(false);
      setEditingApp(null);
      loadData();
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    }
  };

  const getCategoryBadge = (cat: StagedAppCategory) => {
    switch (cat) {
      case 'remote_access':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Remote Access</span>;
      case 'security':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Security</span>;
      case 'productivity':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">Productivity</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-300 border border-slate-500/20">Utility</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e] text-slate-200">
      {/* Top Banner */}
      <div className="p-6 border-b border-slate-800 bg-[#090d16] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <Package className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Staged Applications & Software Packages</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Decoupled Deployment
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Lightweight RMM agents bootstrap first, then automatically pull and install staged software (remote engines, security agents, tools) upon check-in. Update or swap remote tools anytime without redeploying the RMM agent.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Status"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingApp({
                name: '',
                description: '',
                version: '1.0.0',
                category: 'utility',
                os: 'all',
                enabled: true,
                autoDeploy: true,
                detection: { type: 'service', target: '' },
                installScript: { windows: '', macos: '' }
              });
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-900/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Stage New Application</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <span>✓ {actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs font-semibold text-slate-400">Total Staged Apps</div>
            <div className="text-2xl font-black text-white mt-1">{apps.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Configured in catalog</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs font-semibold text-slate-400">Auto-Deploy Enabled</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {apps.filter(a => a.enabled && a.autoDeploy).length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Pushed on agent heartbeat</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs font-semibold text-slate-400">Remote Desktop Engine</div>
            <div className="text-2xl font-black text-blue-400 mt-1">
              {apps.some(a => a.id === 'staged-apexconnect-remote' && a.enabled) ? 'ApexConnect' : 'Custom'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Swappable at anytime</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs font-semibold text-slate-400">Eligible Endpoints</div>
            <div className="text-2xl font-black text-purple-400 mt-1">{deviceList.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Windows, Mac & Linux</div>
          </div>
        </div>

        {/* Applications List */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Configured Software Packages ({apps.length})</span>
          </h2>

          <div className="grid grid-cols-1 gap-4">
            {apps.map((app) => {
              const stat = fleetStats.find(s => s.appId === app.id) || {
                installed: 0,
                queued: 0,
                installing: 0,
                failed: 0,
                totalEligible: deviceList.length
              };

              const coveragePct = stat.totalEligible > 0
                ? Math.round((stat.installed / stat.totalEligible) * 100)
                : 0;

              return (
                <div
                  key={app.id}
                  className="p-5 rounded-xl bg-[#0b0f19] border border-slate-800 hover:border-slate-700 transition flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-sm"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-base font-bold text-white">{app.name}</span>
                      <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">v{app.version}</span>
                      {getCategoryBadge(app.category)}
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
                        {app.os}
                      </span>
                      {app.autoDeploy ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Auto-Deploy Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400">
                          Manual Only
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                      {app.description || 'No description provided.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                      <div>
                        Detection: <span className="text-slate-300 font-mono">{app.detection.type}: {app.detection.target}</span>
                      </div>
                      <div>•</div>
                      <div>
                        Scripts:
                        {app.installScript.windows && <span className="ml-1 text-sky-400 font-mono">Windows (PowerShell)</span>}
                        {app.installScript.windows && app.installScript.macos && <span className="mx-1 text-slate-600">|</span>}
                        {app.installScript.macos && <span className="text-purple-400 font-mono">macOS (Bash)</span>}
                      </div>
                    </div>
                  </div>

                  {/* Fleet Coverage & Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-800/80">
                    {/* Coverage Gauge */}
                    <div className="w-48 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Fleet Installed</span>
                        <span className="text-white font-bold">{stat.installed} / {stat.totalEligible} ({coveragePct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${coveragePct}%` }}
                        />
                        {stat.queued > 0 && (
                          <div
                            className="bg-amber-400 h-full animate-pulse"
                            style={{ width: `${Math.round((stat.queued / stat.totalEligible) * 100)}%` }}
                          />
                        )}
                        {stat.failed > 0 && (
                          <div
                            className="bg-rose-500 h-full"
                            style={{ width: `${Math.round((stat.failed / stat.totalEligible) * 100)}%` }}
                          />
                        )}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{stat.queued} queued</span>
                        {stat.failed > 0 && <span className="text-rose-400 font-bold">{stat.failed} failed</span>}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleAutoDeploy(app)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          app.autoDeploy
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title="Toggle whether RMM agent automatically deploys this on heartbeat"
                      >
                        {app.autoDeploy ? 'Auto-Deploy: ON' : 'Auto-Deploy: OFF'}
                      </button>

                      <button
                        onClick={() => {
                          setDeployModalApp(app);
                          setSelectedTargetDeviceId(deviceList[0]?.id || '');
                        }}
                        className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 transition"
                        title="Deploy to a specific device"
                      >
                        <Laptop className="w-4 h-4" />
                      </button>

                      <button
                        disabled={deployingId === app.id}
                        onClick={() => handleDeployFleet(app)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 transition shadow-sm cursor-pointer"
                        title="Push to all missing endpoints"
                      >
                        <Play className="w-3 h-3" />
                        <span>Deploy Fleet</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingApp({ ...app });
                          setIsModalOpen(true);
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Edit Application"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {app.id !== 'staged-apexconnect-remote' && (
                        <button
                          onClick={() => handleDelete(app.id, app.name)}
                          className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                          title="Delete Staged App"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit / Create Staged App Modal */}
      {isModalOpen && editingApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c101c] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-slate-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0e1424]">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-base">
                  {editingApp.id ? 'Edit Staged Application' : 'Stage New Application Package'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingApp(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Application Name *</label>
                  <input
                    type="text"
                    required
                    value={editingApp.name || ''}
                    onChange={e => setEditingApp({ ...editingApp, name: e.target.value })}
                    placeholder="e.g. ApexConnect Remote Engine"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Version</label>
                  <input
                    type="text"
                    value={editingApp.version || ''}
                    onChange={e => setEditingApp({ ...editingApp, version: e.target.value })}
                    placeholder="e.g. 2.0.4 or latest"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  value={editingApp.description || ''}
                  onChange={e => setEditingApp({ ...editingApp, description: e.target.value })}
                  placeholder="Purpose of this application package"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Category</label>
                  <select
                    value={editingApp.category || 'utility'}
                    onChange={e => setEditingApp({ ...editingApp, category: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="remote_access">Remote Access</option>
                    <option value="security">Security</option>
                    <option value="productivity">Productivity</option>
                    <option value="utility">Utility</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Target Platform</label>
                  <select
                    value={editingApp.os || 'all'}
                    onChange={e => setEditingApp({ ...editingApp, os: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                  >
                    <option value="all">All Operating Systems</option>
                    <option value="windows">Windows Only</option>
                    <option value="macos">macOS Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Auto-Deploy</label>
                  <div className="pt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingApp.autoDeploy ?? true}
                        onChange={e => setEditingApp({ ...editingApp, autoDeploy: e.target.checked })}
                        className="rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-white font-medium">Deploy on check-in</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Detection Settings */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="font-bold text-slate-300">Presence Detection (How RMM knows it is installed)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Detection Type</label>
                    <select
                      value={editingApp.detection?.type || 'service'}
                      onChange={e => setEditingApp({
                        ...editingApp,
                        detection: {
                          type: e.target.value as any,
                          target: editingApp.detection?.target || ''
                        }
                      })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white outline-none focus:border-blue-500"
                    >
                      <option value="service">System Service (e.g. Mesh Agent)</option>
                      <option value="app_name">Installed App Name</option>
                      <option value="file">File Path Exists</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Detection Target String</label>
                    <input
                      type="text"
                      value={editingApp.detection?.target || ''}
                      onChange={e => setEditingApp({
                        ...editingApp,
                        detection: {
                          type: editingApp.detection?.type || 'service',
                          target: e.target.value
                        }
                      })}
                      placeholder="e.g. Mesh Agent or Google Chrome"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Install Scripts */}
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1 flex items-center justify-between">
                    <span>Windows Silent Install Script (PowerShell)</span>
                    <span className="text-[10px] text-sky-400 font-mono">Runs as NT AUTHORITY\SYSTEM</span>
                  </label>
                  <textarea
                    rows={4}
                    value={editingApp.installScript?.windows || ''}
                    onChange={e => setEditingApp({
                      ...editingApp,
                      installScript: {
                        ...editingApp.installScript,
                        windows: e.target.value
                      }
                    })}
                    placeholder="$m = '$env:ProgramData\MyTool.exe'; Invoke-WebRequest ... ; Start-Process $m -ArgumentList '-install' -Wait"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono text-[11px] outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 flex items-center justify-between">
                    <span>macOS Silent Install Script (Bash)</span>
                    <span className="text-[10px] text-purple-400 font-mono">Runs as root daemon</span>
                  </label>
                  <textarea
                    rows={4}
                    value={editingApp.installScript?.macos || ''}
                    onChange={e => setEditingApp({
                      ...editingApp,
                      installScript: {
                        ...editingApp.installScript,
                        macos: e.target.value
                      }
                    })}
                    placeholder="curl -fsSL https://... -o /tmp/app.pkg && installer -pkg /tmp/app.pkg -target /"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono text-[11px] outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingApp(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg cursor-pointer"
                >
                  Save Staged Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deploy to Specific Device Modal */}
      {deployModalApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c101c] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Deploy to Endpoint</h3>
              <button onClick={() => setDeployModalApp(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Push <strong>{deployModalApp.name}</strong> to an individual device via the RMM root/SYSTEM command queue.
            </p>

            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1">Select Target Device</label>
              <select
                value={selectedTargetDeviceId}
                onChange={e => setSelectedTargetDeviceId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 text-xs"
              >
                {deviceList.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.os} - {d.ipAddress})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeployModalApp(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeployToDevice}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1"
              >
                <Play className="w-3 h-3" /> Deploy Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StagedAppsView;
