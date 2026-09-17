import React, { useState } from 'react';
import type { MdmFile } from '@openmsp/api-types';
import { FileText, Upload, RefreshCw, Trash2, CheckCircle2, FileCode } from 'lucide-react';
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
      onTriggerToast(`File configuration registered: ${fileName}`);
      setShowAddModal(false);
      setFileName('');
      onRefresh();
    } catch {
      onTriggerToast('Failed to register file payload');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-white">Remote File & Configuration Distribution</h2>
          <p className="text-xs text-slate-400">
            Push configuration payloads with dynamic runtime variable substitution ({'${deviceId}'}, {'${imei}'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Distribute File
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map((file) => (
          <div
            key={file.id}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sky-400 shrink-0">
                <FileCode className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white text-xs truncate">{file.name}</div>
                <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5" title={file.destPath}>
                  {file.destPath}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800/80">
              <span>Size: {(file.fileSize / 1024).toFixed(1)} KB</span>
              {file.templateVariablesEnabled ? (
                <span className="text-fuchsia-400 font-medium">Variable Template Active</span>
              ) : (
                <span className="text-slate-500">Static Binary</span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
              <span className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
                {file.sha256.slice(0, 16)}...
              </span>
              <button
                onClick={() => onTriggerToast(`Pushing file ${file.name} to target fleet...`)}
                className="font-semibold text-fuchsia-400 hover:text-fuchsia-300"
              >
                Push Now
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-semibold text-white text-sm">Add Distribution File</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">File Name</label>
                <input
                  type="text"
                  required
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g. app-settings.json"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Device Destination Path</label>
                <input
                  type="text"
                  required
                  value={destPath}
                  onChange={(e) => setDestPath(e.target.value)}
                  placeholder="/sdcard/Documents/"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="templateVars"
                  checked={varsEnabled}
                  onChange={(e) => setVarsEnabled(e.target.checked)}
                  className="rounded border-slate-700 text-fuchsia-600 focus:ring-fuchsia-500"
                />
                <label htmlFor="templateVars" className="text-xs text-slate-300">
                  Substitute variables (e.g. {'${deviceId}'}, {'${imei}'})
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg transition-colors"
                >
                  Add to Distribution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
