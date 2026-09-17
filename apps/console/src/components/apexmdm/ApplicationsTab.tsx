import React, { useState } from 'react';
import type { MdmApplication } from '@openmsp/api-types';
import { Package, Upload, Download, RefreshCw, Check, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { apexMdm } from '../../services/api';

interface ApplicationsTabProps {
  apps: MdmApplication[];
  onTriggerToast: (msg: string) => void;
  onRefresh: () => void;
}

export const ApplicationsTab: React.FC<ApplicationsTabProps> = ({ apps, onTriggerToast, onRefresh }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [appName, setAppName] = useState('');
  const [pkgName, setPkgName] = useState('');
  const [version, setVersion] = useState('v1.0.0');
  const [unmetered, setUnmetered] = useState(true);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName || !pkgName) return;
    setUploading(true);
    try {
      await apexMdm.uploadApp({
        name: appName,
        packageName: pkgName,
        version: version,
        unmeteredNetworkOnly: unmetered,
        isKioskMainApp: false,
        autoUpdate: true,
        runAfterInstall: true
      });
      onTriggerToast(`Uploaded and queued silent install for: ${appName}`);
      setShowUploadModal(false);
      setAppName('');
      setPkgName('');
      onRefresh();
    } catch {
      onTriggerToast('Failed to deploy APK');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header action bar */}
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-white">Application Repository & Silent APK Push</h2>
          <p className="text-xs text-slate-400">Distribute enterprise APKs silently with automatic background upgrades</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload APK
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* App list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <div
            key={app.id}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-fuchsia-400">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-white text-xs">{app.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate max-w-[180px]">
                    {app.packageName}
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                v{app.version}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
              <div>
                <span className="text-slate-500 block">Package Size</span>
                <span className="text-slate-200 font-medium">{(app.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
              <div>
                <span className="text-slate-500 block">Wi-Fi Policy</span>
                <span className="text-slate-200 font-medium">{app.unmeteredNetworkOnly ? 'Unmetered' : 'Any'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Auto-Update Active</span>
              </div>
              <button
                onClick={() => onTriggerToast(`Pushing silent update for ${app.name}...`)}
                className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300"
              >
                Push Fleet Sync
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-semibold text-white text-sm">Upload Enterprise APK</h3>
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Application Name</label>
                <input
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. Warehouse Scanner Pro"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Android Package Identifier</label>
                <input
                  type="text"
                  required
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  placeholder="e.g. com.company.scanner"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Version String</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="unmetered"
                  checked={unmetered}
                  onChange={(e) => setUnmetered(e.target.checked)}
                  className="rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                />
                <label htmlFor="unmetered" className="text-xs text-slate-300">
                  Only download on unmetered Wi-Fi networks
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Deploy to Fleet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
