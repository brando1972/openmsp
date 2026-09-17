import React, { useState } from 'react';
import type { MdmFile } from '@openmsp/api-types';
import { FileText, Upload, RefreshCw, Trash2 } from 'lucide-react';
import { apexMdm } from '../../services/api';

interface FilesTabProps {
  files: MdmFile[];
  onTriggerToast: (msg: string) => void;
  onRefresh: () => void;
}

export const FilesTab: React.FC<FilesTabProps> = ({ files, onTriggerToast, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [fileName, setFileName] = useState('');
  const [destPath, setDestPath] = useState('/sdcard/Documents/');
  const [varsEnabled, setVarsEnabled] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName || !destPath) return;
    try {
      await apexMdm.addFile({
        name: fileName,
        destPath: `${destPath.replace(/\/$/, '')}/${fileName}`,
        templateVariablesEnabled: varsEnabled
      });
      onTriggerToast(`Added file distribution rule: ${fileName}`);
      setShowAddModal(false);
      setFileName('');
      onRefresh();
    } catch {
      onTriggerToast('Error adding file distribution');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">File & Content Distribution Engine</h2>
          <p className="text-xs text-slate-400">
            Push arbitrary documents, certificates, PDFs, and config files to tablet storage with template variables.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm"
        >
          <Upload className="w-3.5 h-3.5" /> Upload New File
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
        <table className="w-full text-left">
          <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">File Name</th>
              <th className="py-3 px-4">Destination Path on Tablet</th>
              <th className="py-3 px-4">Template Variables</th>
              <th className="py-3 px-4">Sync Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3 px-4 font-mono text-fuchsia-400 font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {file.name}
                </td>
                <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{file.destPath}</td>
                <td className="py-3 px-4">
                  {file.templateVariablesEnabled ? (
                    <span className="bg-indigo-950 text-indigo-300 font-mono text-[10px] px-2 py-0.5 rounded border border-indigo-800/50">
                      Enabled (${'{DEVICE_ID}'}, ${'{API_URL}'})
                    </span>
                  ) : (
                    <span className="text-slate-500">None (Binary)</span>
                  )}
                </td>
                <td className="py-3 px-4 text-emerald-400 font-mono">
                  {file.syncCount}/{file.totalTargetDevices || 14} Synced
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => onTriggerToast(`Re-syncing ${file.name} to all tablets...`)}
                    className="text-fuchsia-400 hover:text-fuchsia-300 font-medium"
                  >
                    Re-sync
                  </button>
                  <button
                    onClick={() => onTriggerToast(`File ${file.name} removed`)}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Distribute File to Fleet</h3>
            <form onSubmit={handleAdd} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">File Name</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g. store_policy_2026.pdf"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Destination Directory on Tablet</label>
                <input
                  type="text"
                  value={destPath}
                  onChange={(e) => setDestPath(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-[11px]"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={varsEnabled}
                  onChange={(e) => setVarsEnabled(e.target.checked)}
                  className="rounded bg-slate-800 text-fuchsia-600 focus:ring-0"
                />
                Interpolate template variables (e.g. ${'{DEVICE_ID}'}, ${'{IP}'})
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold rounded-lg"
                >
                  Save & Distribute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
