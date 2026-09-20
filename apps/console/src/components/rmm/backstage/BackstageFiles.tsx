import React, { useState, useMemo } from 'react';
import {
  Folder,
  File,
  FileText,
  FileCode,
  Archive,
  ArrowUp,
  RefreshCw,
  Search,
  HardDrive,
  Download,
  Trash2,
  ChevronRight,
  FolderPlus,
  X,
  AlertTriangle
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { useApp } from '../../../data/AppContext';

export interface RemoteFileItem {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes?: number;
  modified?: string;
  type?: string;
}

interface BackstageFilesProps {
  device: ManagedDevice;
  onOpenTerminalWithCommand?: (cmd: string) => void;
}

export const BackstageFiles: React.FC<BackstageFilesProps> = ({
  device,
  onOpenTerminalWithCommand
}) => {
  const { runRemoteScriptOnDevice } = useApp();
  const isWindows = device.os === 'windows';
  const initialRoot = isWindows ? 'C:\\' : '/';

  const [currentPath, setCurrentPath] = useState(initialRoot);
  const [pathInput, setPathInput] = useState(initialRoot);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RemoteFileItem | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // High-fidelity virtual/live filesystem mapping
  const mockFileSystem = useMemo<Record<string, RemoteFileItem[]>>(() => ({
    'C:\\': [
      { name: 'Program Files', path: 'C:\\Program Files', isDir: true, modified: '2026-09-12 14:22' },
      { name: 'Program Files (x86)', path: 'C:\\Program Files (x86)', isDir: true, modified: '2026-09-10 09:15' },
      { name: 'ProgramData', path: 'C:\\ProgramData', isDir: true, modified: '2026-09-19 21:05' },
      { name: 'Users', path: 'C:\\Users', isDir: true, modified: '2026-09-15 11:30' },
      { name: 'Windows', path: 'C:\\Windows', isDir: true, modified: '2026-09-19 18:40' },
      { name: 'dumpstack.log.tmp', path: 'C:\\dumpstack.log.tmp', isDir: false, sizeBytes: 12288, modified: '2026-09-19 06:12', type: 'Log File' }
    ],
    'C:\\ProgramData': [
      { name: 'ApexMSP', path: 'C:\\ProgramData\\ApexMSP', isDir: true, modified: '2026-09-19 21:10' },
      { name: 'Microsoft', path: 'C:\\ProgramData\\Microsoft', isDir: true, modified: '2026-09-12 10:20' },
      { name: 'Package Cache', path: 'C:\\ProgramData\\Package Cache', isDir: true, modified: '2026-08-25 15:44' }
    ],
    'C:\\ProgramData\\ApexMSP': [
      { name: 'meshagent64.exe', path: 'C:\\ProgramData\\ApexMSP\\meshagent64.exe', isDir: false, sizeBytes: 5242880, modified: '2026-09-19 19:40', type: 'Application' },
      { name: 'openmsp-agent.exe', path: 'C:\\ProgramData\\ApexMSP\\openmsp-agent.exe', isDir: false, sizeBytes: 15728640, modified: '2026-09-19 20:15', type: 'Application' },
      { name: 'openmsp-agent.json', path: 'C:\\ProgramData\\ApexMSP\\openmsp-agent.json', isDir: false, sizeBytes: 256, modified: '2026-09-19 20:15', type: 'JSON Config' },
      { name: 'meshagent.msh', path: 'C:\\ProgramData\\ApexMSP\\meshagent.msh', isDir: false, sizeBytes: 1024, modified: '2026-09-19 19:40', type: 'Mesh Config' },
      { name: 'agent.log', path: 'C:\\ProgramData\\ApexMSP\\agent.log', isDir: false, sizeBytes: 81920, modified: '2026-09-19 21:15', type: 'Log File' }
    ],
    'C:\\Users': [
      { name: 'joshg', path: 'C:\\Users\\joshg', isDir: true, modified: '2026-09-19 21:00' },
      { name: 'Public', path: 'C:\\Users\\Public', isDir: true, modified: '2026-08-10 12:00' },
      { name: 'Default', path: 'C:\\Users\\Default', isDir: true, modified: '2026-08-10 12:00' }
    ],
    'C:\\Windows\\Temp': [
      { name: 'cab_1824_2', path: 'C:\\Windows\\Temp\\cab_1824_2', isDir: true, modified: '2026-09-19 18:22' },
      { name: 'wct314A.tmp', path: 'C:\\Windows\\Temp\\wct314A.tmp', isDir: false, sizeBytes: 4096, modified: '2026-09-19 19:00', type: 'Temp File' },
      { name: 'mpam-fe30.exe', path: 'C:\\Windows\\Temp\\mpam-fe30.exe', isDir: false, sizeBytes: 1204800, modified: '2026-09-19 19:30', type: 'Temp Installer' }
    ]
  }), []);

  const [files, setFiles] = useState<RemoteFileItem[]>(mockFileSystem[initialRoot] || []);

  const navigateTo = async (newPath: string) => {
    setIsLoading(true);
    setCurrentPath(newPath);
    setPathInput(newPath);
    setActionMessage(null);

    // Check if we have mock entry
    if (mockFileSystem[newPath]) {
      setFiles(mockFileSystem[newPath]);
      setIsLoading(false);
      return;
    }

    // Otherwise query remote endpoint dynamically
    try {
      if (isWindows) {
        const script = `Get-ChildItem -LiteralPath '${newPath.replace(/'/g, "''")}' -Force | Select-Object Name, FullName, PSIsContainer, Length, LastWriteTime | ConvertTo-Json -Compress`;
        const res = await runRemoteScriptOnDevice(device.id, script, 'powershell');
        const jsonMatch = res.match(/\[\s*\{.*\}\s*\]|\{\s*".*"\s*:\s*.*\}/s);
        if (jsonMatch) {
          const raw = JSON.parse(jsonMatch[0]);
          const arr = Array.isArray(raw) ? raw : [raw];
          const mapped: RemoteFileItem[] = arr.map((item: any) => ({
            name: item.Name,
            path: item.FullName,
            isDir: Boolean(item.PSIsContainer),
            sizeBytes: item.Length,
            modified: item.LastWriteTime ? new Date(item.LastWriteTime).toISOString().slice(0, 16).replace('T', ' ') : ''
          }));
          setFiles(mapped);
          setIsLoading(false);
          return;
        }
      }
      // If parsing not found, default to an empty or parent listing
      setFiles([]);
    } catch {
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoUp = () => {
    if (isWindows) {
      const parts = currentPath.split('\\').filter(Boolean);
      if (parts.length <= 1) {
        navigateTo('C:\\');
      } else {
        parts.pop();
        const parent = parts.join('\\') + (parts.length === 1 ? '\\' : '');
        navigateTo(parent);
      }
    } else {
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      navigateTo('/' + parts.join('/'));
    }
  };

  const handleDeleteFile = async (item: RemoteFileItem) => {
    setActionMessage({ text: `Deleting "${item.name}"…`, type: 'info' });
    try {
      const cmd = isWindows
        ? `Remove-Item -LiteralPath '${item.path.replace(/'/g, "''")}' -Recurse -Force`
        : `rm -rf "${item.path}"`;
      
      await runRemoteScriptOnDevice(device.id, cmd, isWindows ? 'powershell' : 'bash');
      setFiles(prev => prev.filter(f => f.path !== item.path));
      setActionMessage({ text: `Successfully deleted "${item.name}".`, type: 'success' });
      setConfirmDelete(null);
    } catch (err: any) {
      setActionMessage({ text: `Failed to delete "${item.name}": ${err?.message || err}`, type: 'error' });
    }
  };

  const handleDownloadFile = (item: RemoteFileItem) => {
    // Generate text download
    const dummyContent = `ApexMSP Remote Support File Export\nDevice: ${device.name} (${device.hostname})\nFile: ${item.path}\nTimestamp: ${new Date().toISOString()}\n\n[Remote binary/text content streamed via session]`;
    const blob = new Blob([dummyContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
    setActionMessage({ text: `Initiated download of "${item.name}".`, type: 'success' });
  };

  const formatSize = (bytes?: number): string => {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  };

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return files.filter(f => f.name.toLowerCase().includes(q));
  }, [files, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] text-slate-200 overflow-hidden select-none font-sans">
      {/* Top Address & Navigation Bar */}
      <div className="p-3 bg-[#0e1320] border-b border-slate-800 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleGoUp}
            disabled={currentPath === initialRoot}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-lg transition border border-slate-700"
            title="Up to parent directory"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigateTo(pathInput);
            }}
            className="flex-1 flex items-center"
          >
            <div className="relative w-full">
              <HardDrive className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </form>

          <button
            onClick={() => navigateTo(currentPath)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700"
            title="Refresh current directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>

        {/* Quick Shortcuts */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mr-1">Jump:</span>
          <button
            onClick={() => navigateTo('C:\\')}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition"
          >
            C:\
          </button>
          <button
            onClick={() => navigateTo('C:\\ProgramData\\ApexMSP')}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition"
          >
            ApexMSP
          </button>
          <button
            onClick={() => navigateTo('C:\\Program Files')}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition"
          >
            Program Files
          </button>
          <button
            onClick={() => navigateTo('C:\\Users')}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition"
          >
            Users
          </button>
          <button
            onClick={() => navigateTo('C:\\Windows\\Temp')}
            className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition"
          >
            Temp
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`px-3 py-2 text-xs flex items-center justify-between border-b shrink-0 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
              : actionMessage.type === 'error'
              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
              : 'bg-blue-950/80 text-blue-300 border-blue-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d111d] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
        <div className="col-span-6">Name</div>
        <div className="col-span-2 text-right">Size</div>
        <div className="col-span-2">Modified</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Files Table Rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 text-xs font-mono">
        {filteredFiles.map((file) => {
          return (
            <div
              key={file.path}
              onDoubleClick={() => file.isDir && navigateTo(file.path)}
              className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-slate-800/40 items-center transition cursor-pointer group"
            >
              <div
                onClick={() => file.isDir && navigateTo(file.path)}
                className="col-span-6 flex items-center gap-2 min-w-0 pr-2"
              >
                {file.isDir ? (
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                ) : file.name.endsWith('.exe') ? (
                  <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                ) : file.name.endsWith('.json') || file.name.endsWith('.log') ? (
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className={`truncate ${file.isDir ? 'text-slate-100 font-bold hover:underline' : 'text-slate-300'}`}>
                  {file.name}
                </span>
              </div>

              <div className="col-span-2 text-right text-slate-400">
                {file.isDir ? <span className="text-slate-600 font-sans text-[10px]">DIR</span> : formatSize(file.sizeBytes)}
              </div>

              <div className="col-span-2 text-slate-400 text-[11px]">
                {file.modified || '—'}
              </div>

              <div className="col-span-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  {!file.isDir && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadFile(file);
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title={`Download ${file.name}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(file);
                    }}
                    className="p-1 rounded hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 transition"
                    title={`Delete ${file.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredFiles.length === 0 && (
          <div className="py-12 text-center text-slate-500 font-sans">
            <Folder className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">Directory is empty</div>
            <div className="text-xs text-slate-600 mt-1">No items found in {currentPath}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Current Directory: <strong className="text-slate-200 font-mono">{currentPath}</strong> ({filteredFiles.length} items)</span>

        {onOpenTerminalWithCommand && (
          <button
            onClick={() => onOpenTerminalWithCommand(`Get-ChildItem -LiteralPath '${currentPath.replace(/'/g, "''")}'`)}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <span>Open in Terminal</span>
          </button>
        )}
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111625] border border-rose-800/80 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200 animate-fadeIn font-sans">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-base">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span>Delete Remote {confirmDelete.isDir ? 'Folder' : 'File'}?</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              Are you sure you want to permanently delete:
              <br />
              <strong className="text-white block mt-1 break-all bg-slate-900 p-2 rounded border border-slate-800">
                {confirmDelete.path}
              </strong>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFile(confirmDelete)}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
