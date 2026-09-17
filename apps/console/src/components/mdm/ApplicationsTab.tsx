import React, { useState } from 'react';
import type { MdmApplication } from '@openmsp/api-types';
import { Package, Upload, Download, RefreshCw, Check } from 'lucide-react';
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
        versionName: version,
        versionCode: 1,
        unmetered,
        fileSizeBytes: 24500000
      });
      onTriggerToast(`Uploaded and registered ${appName} (${pkgName})`);
      setShowUploadModal(false);
      setAppName('');
      setPkgName('');
      onRefresh();
    } catch {
      onTriggerToast('Error uploading APK');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Hosted APK Application Repository</h2>
          <p className="text-xs text-slate-400">
            Upload private enterprise APKs or public apps for silent background installation on enrolled tablets.
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm"
        >
          <Upload className="w-3.5 h-3.5" /> Upload New APK
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
        <table className="w-full text-left">
          <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Application</th>
              <th className="py-3 px-4">Package Name</th>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4">Size</th>
              <th className="py-3 px-4">Data Saver</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {apps.map((app) => (
              <tr key={app.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3 px-4 flex items-center gap-2.5 font-medium">
                  <div className="w-7 h-7 rounded bg-fuchsia-600/80 flex items-center justify-center text-white font-bold text-xs">
                    {app.name.charAt(0)}
                  </div>
                  {app.name}
                </td>
                <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{app.packageName}</td>
                <td className="py-3 px-4 font-mono text-emerald-400">
                  {app.versionName} (b{app.versionCode})
                </td>
                <td className="py-3 px-4 text-slate-400">{(app.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</td>
                <td className="py-3 px-4">
                  {app.unmetered ? (
                    <span className="text-emerald-400">Unmetered (Whitelisted)</span>
                  ) : (
                    <span className="text-slate-400">{app.dataSaverCapMb} MB Cap</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => onTriggerToast(`Pushing silent update for ${app.name} to all devices...`)}
                    className="text-fuchsia-400 hover:text-fuchsia-300 font-medium"
                  >
                    Force Update
                  </button>
                  <button
                    onClick={() => onTriggerToast(`Downloading ${app.apkFileName}`)}
                    className="text-slate-400 hover:text-white"
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Upload New Application APK</h3>
            <form onSubmit={handleUpload} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">App Display Name</label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. Delivery Dispatcher"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Package Name</label>
                <input
                  type="text"
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  placeholder="e.g. com.apexmsp.delivery"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-[11px]"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Version String</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-[11px]"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={unmetered}
                  onChange={(e) => setUnmetered(e.target.checked)}
                  className="rounded bg-slate-800 text-fuchsia-600 focus:ring-0"
                />
                Unmetered (Zero-rated for cellular data saver)
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold rounded-lg"
                >
                  {uploading ? 'Uploading...' : 'Upload & Commit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
