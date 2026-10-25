import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Upload,
  FolderUp,
  Trash2,
  ChevronRight,
  FolderPlus,
  X,
  AlertTriangle
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { BackstageLiveStatus } from './BackstageLiveStatus';
import { MeshFileChannel, RemoteDirEntry, TransferCancelled } from './meshFiles';
import { buildZip, ZipEntry } from './zipStore';

// Folder downloads are zipped in browser memory, so keep them bounded.
const MAX_FOLDER_BYTES = 1024 * 1024 * 1024;
const MAX_FOLDER_FILES = 5000;

interface TransferState {
  label: string;
  done: number;
  total: number | null;
  controller: AbortController;
}

interface PendingUpload {
  items: { file: File; relPath: string }[];
  conflicts: string[];
}

const joinWin = (dir: string, name: string) => `${dir.replace(/\\+$/, '')}\\${name}`;

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatModified = (d?: string): string | undefined => {
  if (!d) return undefined;
  const t = new Date(d);
  if (isNaN(t.getTime())) return undefined;
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
};

const toItem = (dir: string, e: RemoteDirEntry): RemoteFileItem => ({
  name: e.n,
  path: joinWin(dir, e.n),
  isDir: e.t !== 3,
  sizeBytes: e.t === 3 ? e.s : undefined,
  modified: formatModified(e.d)
});

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

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
  const isWindows = device.os === 'windows';
  const initialRoot = isWindows ? 'C:\\' : '/';

  const [currentPath, setCurrentPath] = useState(initialRoot);
  const [pathInput, setPathInput] = useState(initialRoot);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RemoteFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [files, setFiles] = useState<RemoteFileItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const requestSeq = useRef(0);
  // Everything here (listing, delete, transfers) goes over MeshCentral's file
  // relay, which stays connected; the ApexMSP agent's queue is far slower.
  const channelRef = useRef<Promise<MeshFileChannel> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { channelRef.current?.then((c) => c.close()).catch(() => {}); }, []);

  const getChannel = useCallback(async (): Promise<MeshFileChannel> => {
    const existing = channelRef.current;
    if (existing) {
      try {
        const c = await existing;
        if (!c.closed) return c;
      } catch { /* reopen below */ }
    }
    const opening = MeshFileChannel.open(device.id);
    channelRef.current = opening;
    opening.catch(() => { if (channelRef.current === opening) channelRef.current = null; });
    return opening;
  }, [device.id]);

  const listDir = useCallback(async (path: string): Promise<RemoteFileItem[]> => {
    const channel = await getChannel();
    const entries = await channel.ls(path);
    if (!entries) throw new Error(`Can't open ${path}: it doesn't exist or access is denied.`);
    const items = entries.filter((e) => e.t !== 1).map((e) => toItem(path, e));
    items.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    return items;
  }, [getChannel]);

  const navigateTo = useCallback(async (newPath: string) => {
    const seq = ++requestSeq.current;
    setCurrentPath(newPath);
    setPathInput(newPath);
    setActionMessage(null);
    setLoadError(null);
    setFiles([]);
    setSelectedPath(null);
    if (!isWindows) return;

    setIsLoading(true);
    try {
      const items = await listDir(newPath);
      if (seq !== requestSeq.current) return;
      setFiles(items);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [isWindows, listDir]);

  useEffect(() => {
    navigateTo(initialRoot);
  }, [navigateTo, initialRoot]);

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
    setIsDeleting(true);
    setActionMessage({ text: `Deleting "${item.name}"…`, type: 'info' });
    try {
      const channel = await getChannel();
      await channel.rm(currentPath, [item.name]);
      const after = await listDir(currentPath);
      if (after.some((f) => f.name.toLowerCase() === item.name.toLowerCase())) {
        throw new Error('it is still there. It may be in use by another program, or access is denied.');
      }
      setConfirmDelete(null);
      await navigateTo(currentPath);
      setActionMessage({ text: `Deleted "${item.name}".`, type: 'success' });
    } catch (err) {
      setConfirmDelete(null);
      setActionMessage({ text: `Failed to delete "${item.name}": ${err instanceof Error ? err.message : err}`, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const transferError = (verb: string, name: string, err: unknown) => {
    if (err instanceof TransferCancelled) {
      setActionMessage({ text: `${verb} of "${name}" cancelled.`, type: 'info' });
    } else {
      setActionMessage({ text: `${verb} of "${name}" failed: ${err instanceof Error ? err.message : err}`, type: 'error' });
    }
  };

  const handleDownload = async (item: RemoteFileItem) => {
    if (transfer) return;
    const controller = new AbortController();
    setActionMessage(null);
    setTransfer({ label: `Preparing download of "${item.name}"…`, done: 0, total: null, controller });
    try {
      if (!item.isDir) {
        const channel = await getChannel();
        setTransfer({ label: `Downloading "${item.name}"`, done: 0, total: item.sizeBytes ?? null, controller });
        const data = await channel.download(
          item.path,
          (done, total) => setTransfer((t) => (t ? { ...t, done, total } : t)),
          controller.signal,
          item.sizeBytes
        );
        saveBlob(new Blob([data]), item.name);
        setActionMessage({ text: `Downloaded "${item.name}" (${formatBytes(data.length)}).`, type: 'success' });
        return;
      }

      // Walk the folder over the file channel to find every file in it.
      const walker = await getChannel();
      const rows: { Rel: string; Length: number; Modified?: string }[] = [];
      const pending: string[] = [''];
      let walkedBytes = 0;
      while (pending.length > 0) {
        if (controller.signal.aborted) throw new TransferCancelled();
        const rel = pending.shift()!;
        const abs = rel ? joinWin(item.path, rel) : item.path;
        setTransfer((t) => (t ? { ...t, label: `Scanning "${item.name}"… ${rows.length} files found` } : t));
        const entries = await walker.ls(abs);
        if (!entries) throw new Error(`can't read ${abs} (access denied?).`);
        for (const e of entries) {
          const childRel = rel ? `${rel}\\${e.n}` : e.n;
          if (e.t === 3) {
            rows.push({ Rel: childRel, Length: e.s ?? 0, Modified: e.d });
            walkedBytes += e.s ?? 0;
          } else if (e.t === 2) {
            pending.push(childRel);
          }
        }
        if (rows.length > MAX_FOLDER_FILES || walkedBytes > MAX_FOLDER_BYTES) break;
      }
      if (controller.signal.aborted) throw new TransferCancelled();
      const totalBytes = rows.reduce((n, r) => n + Number(r.Length || 0), 0);
      if (rows.length > MAX_FOLDER_FILES || totalBytes > MAX_FOLDER_BYTES) {
        throw new Error(
          `the folder has ${rows.length.toLocaleString()} files (${formatBytes(totalBytes)}). ` +
          `Folder downloads are limited to ${MAX_FOLDER_FILES.toLocaleString()} files and ${formatBytes(MAX_FOLDER_BYTES)}; download a smaller subfolder.`
        );
      }

      const channel = await getChannel();
      const entries: ZipEntry[] = [];
      let doneBefore = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        setTransfer({ label: `Downloading "${item.name}" (file ${i + 1} of ${rows.length})`, done: doneBefore, total: totalBytes, controller });
        const data = await channel.download(
          joinWin(item.path, r.Rel),
          (done) => setTransfer((t) => (t ? { ...t, done: doneBefore + done } : t)),
          controller.signal,
          Number(r.Length || 0)
        );
        entries.push({ name: `${item.name}/${r.Rel.replace(/\\/g, '/')}`, data, modified: r.Modified ? new Date(r.Modified) : undefined });
        doneBefore += data.length;
      }
      saveBlob(buildZip(entries), `${item.name}.zip`);
      setActionMessage({
        text: rows.length === 0
          ? `"${item.name}" has no files; downloaded an empty zip.`
          : `Downloaded "${item.name}" as ${item.name}.zip (${rows.length} files, ${formatBytes(doneBefore)}).`,
        type: 'success'
      });
    } catch (err) {
      transferError('Download', item.name, err);
    } finally {
      setTransfer(null);
    }
  };

  const queueUpload = (list: FileList | null, asFolder: boolean) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map((file) => ({
      file,
      relPath: (asFolder && file.webkitRelativePath ? file.webkitRelativePath : file.name).replace(/\//g, '\\')
    }));
    const existing = new Set(files.map((f) => f.name.toLowerCase()));
    const topNames = Array.from(new Set(items.map((i) => i.relPath.split('\\')[0])));
    const conflicts = topNames.filter((n) => existing.has(n.toLowerCase()));
    if (conflicts.length > 0) setPendingUpload({ items, conflicts });
    else startUpload(items);
  };

  const startUpload = async (items: PendingUpload['items']) => {
    setPendingUpload(null);
    if (transfer || items.length === 0) return;
    const controller = new AbortController();
    const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
    const what = items.length === 1 ? `"${items[0].file.name}"` : `${items.length} files`;
    const target = currentPath;
    setActionMessage(null);
    setTransfer({ label: `Preparing upload of ${what}…`, done: 0, total: totalBytes, controller });
    try {
      const channel = await getChannel();
      // Create missing folders level by level. The agent's mkdir fails on a
      // folder that already exists, so check each parent's listing first.
      const dirs = Array.from(new Set(
        items.flatMap((i) => {
          const parts = i.relPath.split('\\').slice(0, -1);
          return parts.map((_, k) => parts.slice(0, k + 1).join('\\'));
        })
      )).sort((a, b) => a.split('\\').length - b.split('\\').length);
      const known = new Map<string, Set<string>>();
      for (const rel of dirs) {
        const parts = rel.split('\\');
        const name = parts.pop()!;
        const parentAbs = parts.length ? joinWin(target, parts.join('\\')) : target;
        let names = known.get(parentAbs.toLowerCase());
        if (!names) {
          const entries = await channel.ls(parentAbs);
          if (!entries) throw new Error(`can't read ${parentAbs} (access denied?).`);
          names = new Set(entries.map((e) => e.n.toLowerCase()));
          known.set(parentAbs.toLowerCase(), names);
        }
        if (!names.has(name.toLowerCase())) {
          await channel.mkdir(joinWin(parentAbs, name));
          names.add(name.toLowerCase());
          known.set(joinWin(parentAbs, name).toLowerCase(), new Set());
        }
      }
      let doneBefore = 0;
      for (let i = 0; i < items.length; i++) {
        const { file, relPath } = items[i];
        setTransfer({ label: `Uploading "${file.name}" (${i + 1} of ${items.length})`, done: doneBefore, total: totalBytes, controller });
        await channel.upload(
          joinWin(target, relPath),
          file,
          (done) => setTransfer((t) => (t ? { ...t, done: doneBefore + done } : t)),
          controller.signal
        );
        doneBefore += file.size;
      }
      setActionMessage({ text: `Uploaded ${what} (${formatBytes(totalBytes)}) to ${target}.`, type: 'success' });
    } catch (err) {
      transferError('Upload', items.length === 1 ? items[0].file.name : `${items.length} files`, err);
    } finally {
      setTransfer(null);
      if (currentPath === target) navigateTo(target);
    }
  };

  const selectedItem = files.find((f) => f.path === selectedPath) || null;

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

        {isWindows && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!!transfer || isLoading || !!loadError}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
              title={`Upload files into ${currentPath}`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload file
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={!!transfer || isLoading || !!loadError}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
              title={`Upload a folder into ${currentPath}`}
            >
              <FolderUp className="w-3.5 h-3.5" /> Upload folder
            </button>
            <button
              onClick={() => selectedItem && handleDownload(selectedItem)}
              disabled={!selectedItem || !!transfer}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700 text-white rounded-lg border border-blue-500 text-[11px] font-semibold flex items-center gap-1.5 transition"
              title={selectedItem ? `Download ${selectedItem.name}` : 'Select a file or folder to download'}
            >
              <Download className="w-3.5 h-3.5" />
              {selectedItem ? `Download ${selectedItem.isDir ? 'folder' : 'file'}` : 'Download'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { queueUpload(e.target.files, false); e.target.value = ''; }}
            />
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => { queueUpload(e.target.files, true); e.target.value = ''; }}
            />
          </div>
        )}

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

      {transfer && (
        <div className="px-3 py-2 border-b border-sky-900 bg-sky-950/60 shrink-0 text-xs text-sky-200 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{transfer.label}</span>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-sky-300">
                {formatBytes(transfer.done)}{transfer.total != null ? ` / ${formatBytes(transfer.total)}` : ''}
              </span>
              <button
                onClick={() => transfer.controller.abort()}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
            <div
              className={`h-full bg-sky-400 transition-all ${transfer.total ? '' : 'animate-pulse w-1/3'}`}
              style={transfer.total ? { width: `${Math.min(100, (transfer.done / transfer.total) * 100)}%` } : undefined}
            />
          </div>
        </div>
      )}

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
              onClick={() => setSelectedPath(file.path)}
              onDoubleClick={() => file.isDir && navigateTo(file.path)}
              className={`grid grid-cols-12 gap-2 px-3 py-2 items-center transition cursor-pointer group ${
                selectedPath === file.path ? 'bg-blue-950/60 ring-1 ring-inset ring-blue-700' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="col-span-6 flex items-center gap-2 min-w-0 pr-2">
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(file);
                    }}
                    disabled={!!transfer}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-white transition"
                    title={file.isDir ? `Download ${file.name} as .zip` : `Download ${file.name}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
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

        {!isWindows ? (
          <BackstageLiveStatus state="unsupported" deviceName={device.name} what="file browsing" />
        ) : isLoading && files.length === 0 ? (
          <BackstageLiveStatus state="loading" deviceName={device.name} what={currentPath} />
        ) : loadError ? (
          <BackstageLiveStatus state="error" deviceName={device.name} what={currentPath} error={loadError} onRetry={() => navigateTo(currentPath)} />
        ) : filteredFiles.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-sans">
            <Folder className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">{searchQuery ? 'No matching items' : 'Folder is empty'}</div>
            <div className="text-xs text-slate-600 mt-1">{currentPath}</div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Current Directory: <strong className="text-slate-200 font-mono">{currentPath}</strong> ({filteredFiles.length} items) · Double-click a folder to open it</span>

        {onOpenTerminalWithCommand && (
          <button
            onClick={() => onOpenTerminalWithCommand(`Get-ChildItem -LiteralPath '${currentPath.replace(/'/g, "''")}'`)}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <span>Open in Terminal</span>
          </button>
        )}
      </div>

      {pendingUpload && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111625] border border-amber-800/80 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200 font-sans">
            <div className="flex items-center gap-3 text-amber-400 font-bold text-base">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span>Replace existing items?</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {currentPath} already contains:
            </p>
            <div className="text-xs font-mono bg-slate-900 p-2 rounded border border-slate-800 max-h-32 overflow-y-auto">
              {pendingUpload.conflicts.map((n) => <div key={n} className="truncate">{n}</div>)}
            </div>
            <p className="text-xs text-slate-400">Files with the same name will be overwritten on the device.</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setPendingUpload(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => startUpload(pendingUpload.items)}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
              >
                Replace and upload
              </button>
            </div>
          </div>
        </div>
      )}

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
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteFile(confirmDelete)}
                disabled={isDeleting}
                className="disabled:opacity-50 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
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
