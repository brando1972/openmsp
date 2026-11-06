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
  FolderPlus,
  FilePlus,
  Edit3,
  Copy,
  Scissors,
  ClipboardPaste,
  PackageOpen,
  FileArchive,
  Type,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  AlertTriangle
} from 'lucide-react';
import { ManagedDevice } from '../../../types';
import { BackstageLiveStatus } from './BackstageLiveStatus';
import { FileChannel, MeshFileChannel, RemoteDirEntry, RemoteDriveInfo, TransferCancelled } from './meshFiles';
import { buildZip, ZipEntry } from './zipStore';

// Folder downloads are zipped on the endpoint first; browser memory zipping is the fallback.
const MAX_FOLDER_BYTES = 1024 * 1024 * 1024;
const MAX_FOLDER_FILES = 5000;
const MAX_EDITABLE_BYTES = 2 * 1024 * 1024; // 2 MB max for in-browser text editor

const EDITABLE_EXT_RE = /\.(txt|log|csv|tsv|json|ps1|psm1|psd1|bat|cmd|sh|bash|zsh|py|rb|pl|js|mjs|cjs|ts|tsx|jsx|xml|plist|yml|yaml|ini|conf|cfg|toml|md|env|reg|sql|html|htm|css|vbs|gitignore|dockerignore)$/i;

type SortField = 'name' | 'size' | 'modified';
type SortDir = 'asc' | 'desc';

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

interface ClipboardState {
  mode: 'copy' | 'move';
  sourceDir: string;
  items: RemoteFileItem[];
}

interface EditorState {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isNew: boolean;
  isSaving: boolean;
  error: string | null;
}

const joinPath = (dir: string, name: string, isWindows: boolean): string => {
  if (isWindows) {
    const cleanDir = dir.replace(/\//g, '\\').replace(/\\+$/, '');
    const cleanName = name.replace(/\//g, '\\').replace(/^\\+/, '');
    return cleanName ? `${cleanDir}\\${cleanName}` : `${cleanDir}\\`;
  }
  const cleanDir = dir === '/' ? '' : dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '');
  return cleanName ? `${cleanDir}/${cleanName}` : (cleanDir || '/');
};

const normalizePath = (raw: string, isWindows: boolean): string => {
  const trimmed = raw.trim();
  if (isWindows) {
    if (!trimmed || trimmed === '\\' || trimmed === '/') return 'C:\\';
    const win = trimmed.replace(/\//g, '\\');
    if (/^[a-zA-Z]:\\?$/.test(win)) return `${win[0].toUpperCase()}:\\`;
    return win.replace(/\\+$/, '');
  }
  if (!trimmed) return '/';
  const posix = trimmed.replace(/\\/g, '/');
  const withLead = posix.startsWith('/') ? posix : `/${posix}`;
  return withLead.length > 1 ? withLead.replace(/\/+$/, '') : '/';
};

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

const toItem = (dir: string, e: RemoteDirEntry, isWindows: boolean): RemoteFileItem => ({
  name: e.n,
  path: joinPath(dir, e.n, isWindows),
  isDir: e.t !== 3,
  sizeBytes: e.t === 3 ? e.s : undefined,
  modified: formatModified(e.d),
  modifiedIso: e.d
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
  modifiedIso?: string;
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
  const isMac = device.os === 'macos';
  const isSupportedOs = isWindows || isMac || device.os === 'linux';
  const deviceOs: 'windows' | 'macos' | 'linux' = isWindows ? 'windows' : device.os === 'linux' ? 'linux' : 'macos';
  const initialRoot = isWindows ? 'C:\\' : '/';

  const [currentPath, setCurrentPath] = useState(initialRoot);
  const [pathInput, setPathInput] = useState(initialRoot);
  const [editingPathBar, setEditingPathBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RemoteFileItem[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [files, setFiles] = useState<RemoteFileItem[]>([]);
  const [drives, setDrives] = useState<RemoteDriveInfo[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [channelMode, setChannelMode] = useState<'mesh' | 'agent' | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [isBusyOp, setIsBusyOp] = useState(false);

  // Add Folder modal state
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<RemoteFileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // In-browser File Viewer / Editor modal state
  const [editor, setEditor] = useState<EditorState | null>(null);

  const requestSeq = useRef(0);
  const channelRef = useRef<Promise<FileChannel> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { channelRef.current?.then((c) => c.close()).catch(() => {}); }, []);

  useEffect(() => {
    if (showAddFolder) {
      setTimeout(() => newFolderInputRef.current?.focus(), 40);
    }
  }, [showAddFolder]);

  useEffect(() => {
    if (renameTarget) {
      setTimeout(() => renameInputRef.current?.focus(), 40);
    }
  }, [renameTarget]);

  const getChannel = useCallback(async (): Promise<FileChannel> => {
    const existing = channelRef.current;
    if (existing) {
      try {
        const c = await existing;
        if (!c.closed) {
          setChannelMode(c.mode);
          return c;
        }
      } catch { /* reopen below */ }
    }
    const opening = MeshFileChannel.open(device.id, deviceOs);
    channelRef.current = opening;
    opening.then((c) => setChannelMode(c.mode)).catch(() => {
      if (channelRef.current === opening) channelRef.current = null;
    });
    return opening;
  }, [device.id, deviceOs]);

  const refreshDrives = useCallback(async () => {
    if (!isSupportedOs) return;
    try {
      const channel = await getChannel();
      const d = await channel.listDrives();
      if (Array.isArray(d) && d.length > 0) setDrives(d);
    } catch { /* ignore */ }
  }, [getChannel, isSupportedOs]);

  const listDir = useCallback(async (path: string): Promise<RemoteFileItem[]> => {
    const channel = await getChannel();
    const entries = await channel.ls(path);
    if (!entries) throw new Error(`Can't open ${path}: it doesn't exist or access is denied.`);
    const items = entries.filter((e) => e.t !== 1).map((e) => toItem(path, e, isWindows));
    return items;
  }, [getChannel, isWindows]);

  const navigateTo = useCallback(async (rawPath: string) => {
    const newPath = normalizePath(rawPath, isWindows);
    const seq = ++requestSeq.current;
    setCurrentPath(newPath);
    setPathInput(newPath);
    setEditingPathBar(false);
    setActionMessage(null);
    setLoadError(null);
    setFiles([]);
    setSelectedPaths(new Set());
    if (!isSupportedOs) return;

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
  }, [isSupportedOs, isWindows, listDir]);

  useEffect(() => {
    channelRef.current?.then((c) => c.close()).catch(() => {});
    channelRef.current = null;
    setChannelMode(null);
    setDrives([]);
    navigateTo(initialRoot);
    refreshDrives();
  }, [device.id, initialRoot, navigateTo, refreshDrives]);

  const handleGoUp = () => {
    if (isWindows) {
      const parts = currentPath.split('\\').filter(Boolean);
      if (parts.length <= 1) {
        navigateTo(parts[0] ? `${parts[0]}\\` : 'C:\\');
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

  const breadcrumbs = useMemo(() => {
    if (isWindows) {
      const parts = currentPath.split('\\').filter(Boolean);
      if (parts.length === 0) return [{ label: 'C:\\', path: 'C:\\' }];
      return parts.map((part, idx) => {
        const sub = parts.slice(0, idx + 1).join('\\');
        return {
          label: idx === 0 ? `${part}\\` : part,
          path: idx === 0 ? `${part}\\` : sub
        };
      });
    }
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs = [{ label: '/', path: '/' }];
    parts.forEach((part, idx) => {
      crumbs.push({
        label: part,
        path: '/' + parts.slice(0, idx + 1).join('/')
      });
    });
    return crumbs;
  }, [currentPath, isWindows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matching = files.filter((f) => f.name.toLowerCase().includes(q));
    const dirMult = sortDir === 'asc' ? 1 : -1;
    return [...matching].sort((a, b) => {
      if (a.isDir !== b.isDir) return Number(b.isDir) - Number(a.isDir);
      if (sortField === 'size') {
        return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * dirMult;
      }
      if (sortField === 'modified') {
        return (a.modifiedIso ?? '').localeCompare(b.modifiedIso ?? '') * dirMult;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * dirMult;
    });
  }, [files, searchQuery, sortField, sortDir]);

  const selectedItems = useMemo(
    () => files.filter((f) => selectedPaths.has(f.path)),
    [files, selectedPaths]
  );
  const primarySelected = selectedItems.length === 1 ? selectedItems[0] : null;

  const toggleSelectItem = (path: string, multi: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredFiles.map((f) => f.path)));
    }
  };

  const handleOpenAddFolder = () => {
    setNewFolderName('');
    setNewFolderError(null);
    setShowAddFolder(true);
  };

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setNewFolderError('Please enter a folder name.');
      return;
    }
    if (trimmed === '.' || trimmed === '..') {
      setNewFolderError('Folder name cannot be "." or "..".');
      return;
    }
    if (/[\\/]/.test(trimmed) || (isWindows && /[<>:"|?*]/.test(trimmed))) {
      setNewFolderError(
        isWindows
          ? 'Folder name cannot contain \\ / : * ? " < > |'
          : 'Folder name cannot contain / or \\'
      );
      return;
    }
    if (files.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewFolderError(`"${trimmed}" already exists in ${currentPath}.`);
      return;
    }

    setIsCreatingFolder(true);
    setNewFolderError(null);
    const targetFolder = joinPath(currentPath, trimmed, isWindows);
    try {
      const channel = await getChannel();
      await channel.mkdir(targetFolder);
      const after = await listDir(currentPath);
      if (!after.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`Could not create "${trimmed}" in ${currentPath} (access denied or read-only directory).`);
      }
      setFiles(after);
      setShowAddFolder(false);
      setNewFolderName('');
      setSelectedPaths(new Set([targetFolder]));
      setActionMessage({ text: `Created folder "${trimmed}" in ${currentPath}.`, type: 'success' });
    } catch (err) {
      setNewFolderError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleOpenRename = (item: RemoteFileItem) => {
    setRenameTarget(item);
    setRenameValue(item.name);
    setRenameError(null);
  };

  const handleRenameSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    if (/[\\/]/.test(trimmed) || (isWindows && /[<>:"|?*]/.test(trimmed))) {
      setRenameError('Invalid characters in file/folder name.');
      return;
    }
    if (files.some((f) => f.path !== renameTarget.path && f.name.toLowerCase() === trimmed.toLowerCase())) {
      setRenameError(`"${trimmed}" already exists in ${currentPath}.`);
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      const channel = await getChannel();
      await channel.rename(currentPath, renameTarget.name, trimmed);
      const after = await listDir(currentPath);
      setFiles(after);
      setRenameTarget(null);
      setSelectedPaths(new Set([joinPath(currentPath, trimmed, isWindows)]));
      setActionMessage({ text: `Renamed "${renameTarget.name}" to "${trimmed}".`, type: 'success' });
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteItems = async (itemsToDelete: RemoteFileItem[]) => {
    if (itemsToDelete.length === 0) return;
    setIsDeleting(true);
    const label = itemsToDelete.length === 1 ? `"${itemsToDelete[0].name}"` : `${itemsToDelete.length} items`;
    setActionMessage({ text: `Deleting ${label}…`, type: 'info' });
    try {
      const channel = await getChannel();
      await channel.rm(currentPath, itemsToDelete.map((i) => i.name));
      const after = await listDir(currentPath);
      setConfirmDelete(null);
      setFiles(after);
      setSelectedPaths(new Set());
      setActionMessage({ text: `Deleted ${label}.`, type: 'success' });
    } catch (err) {
      setConfirmDelete(null);
      setActionMessage({ text: `Failed to delete ${label}: ${err instanceof Error ? err.message : err}`, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyOrCut = (mode: 'copy' | 'move', itemsToStage: RemoteFileItem[]) => {
    if (itemsToStage.length === 0) return;
    setClipboard({ mode, sourceDir: currentPath, items: itemsToStage });
    const verb = mode === 'copy' ? 'Copied' : 'Cut';
    setActionMessage({
      text: `${verb} ${itemsToStage.length} item(s). Navigate to destination folder and click Paste.`,
      type: 'info'
    });
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.items.length === 0 || isBusyOp) return;
    setIsBusyOp(true);
    const label = `${clipboard.items.length} item(s)`;
    setActionMessage({
      text: `${clipboard.mode === 'move' ? 'Moving' : 'Copying'} ${label} into ${currentPath}…`,
      type: 'info'
    });
    try {
      const channel = await getChannel();
      await channel.copyOrMove(
        clipboard.items.map((i) => i.path),
        currentPath,
        clipboard.mode
      );
      const after = await listDir(currentPath);
      setFiles(after);
      if (clipboard.mode === 'move') setClipboard(null);
      setActionMessage({
        text: `${clipboard.mode === 'move' ? 'Moved' : 'Copied'} ${label} into ${currentPath}.`,
        type: 'success'
      });
    } catch (err) {
      setActionMessage({
        text: `Paste failed: ${err instanceof Error ? err.message : err}`,
        type: 'error'
      });
    } finally {
      setIsBusyOp(false);
    }
  };

  const handleExtractZip = async (zipItem: RemoteFileItem) => {
    if (isBusyOp) return;
    setIsBusyOp(true);
    const folderName = zipItem.name.replace(/\.zip$/i, '') || `${zipItem.name}_extracted`;
    const destDir = joinPath(currentPath, folderName, isWindows);
    setActionMessage({ text: `Extracting "${zipItem.name}" to ${destDir} on device…`, type: 'info' });
    try {
      const channel = await getChannel();
      await channel.extractZip(zipItem.path, destDir);
      const after = await listDir(currentPath);
      setFiles(after);
      setSelectedPaths(new Set([destDir]));
      setActionMessage({ text: `Extracted "${zipItem.name}" into "${folderName}".`, type: 'success' });
    } catch (err) {
      setActionMessage({
        text: `Failed to extract "${zipItem.name}": ${err instanceof Error ? err.message : err}`,
        type: 'error'
      });
    } finally {
      setIsBusyOp(false);
    }
  };

  const handleCompressOnEndpoint = async (itemsToZip: RemoteFileItem[]) => {
    if (itemsToZip.length === 0 || isBusyOp) return;
    setIsBusyOp(true);
    const baseName = itemsToZip.length === 1
      ? `${itemsToZip[0].name.replace(/\.zip$/i, '')}.zip`
      : `Archive_${new Date().toISOString().slice(0, 10)}.zip`;
    const destZip = joinPath(currentPath, baseName, isWindows);
    setActionMessage({ text: `Compressing ${itemsToZip.length} item(s) to "${baseName}" on device…`, type: 'info' });
    try {
      const channel = await getChannel();
      await channel.createZipOnEndpoint(currentPath, itemsToZip.map((i) => i.name), destZip);
      const after = await listDir(currentPath);
      setFiles(after);
      setSelectedPaths(new Set([destZip]));
      setActionMessage({ text: `Created archive "${baseName}" in ${currentPath}.`, type: 'success' });
    } catch (err) {
      setActionMessage({
        text: `Failed to create "${baseName}": ${err instanceof Error ? err.message : err}`,
        type: 'error'
      });
    } finally {
      setIsBusyOp(false);
    }
  };

  const handleOpenEditor = async (item: RemoteFileItem) => {
    if (item.isDir || transfer) return;
    if ((item.sizeBytes ?? 0) > MAX_EDITABLE_BYTES) {
      setActionMessage({
        text: `"${item.name}" is ${formatBytes(item.sizeBytes ?? 0)}. Only files up to 2 MB can be edited in-browser; download it instead.`,
        type: 'error'
      });
      return;
    }
    const controller = new AbortController();
    setTransfer({ label: `Opening "${item.name}"…`, done: 0, total: item.sizeBytes ?? null, controller });
    try {
      const channel = await getChannel();
      const bytes = await channel.download(
        item.path,
        (done, total) => setTransfer((t) => (t ? { ...t, done, total } : t)),
        controller.signal,
        item.sizeBytes
      );
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      setEditor({
        path: item.path,
        name: item.name,
        content: text,
        originalContent: text,
        isNew: false,
        isSaving: false,
        error: null
      });
    } catch (err) {
      transferError('Open', item.name, err);
    } finally {
      setTransfer(null);
    }
  };

  const handleOpenNewFile = () => {
    setEditor({
      path: joinPath(currentPath, 'untitled.txt', isWindows),
      name: 'untitled.txt',
      content: '',
      originalContent: '',
      isNew: true,
      isSaving: false,
      error: null
    });
  };

  const handleSaveEditor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editor) return;
    const trimmedName = editor.name.trim();
    if (!trimmedName || /[\\/]/.test(trimmedName)) {
      setEditor({ ...editor, error: 'Please enter a valid file name.' });
      return;
    }
    const targetPath = editor.isNew ? joinPath(currentPath, trimmedName, isWindows) : editor.path;
    setEditor({ ...editor, isSaving: true, error: null });
    try {
      const channel = await getChannel();
      const blob = new Blob([editor.content], { type: 'text/plain;charset=utf-8' });
      await channel.upload(targetPath, blob);
      const after = await listDir(currentPath);
      setFiles(after);
      setSelectedPaths(new Set([targetPath]));
      setEditor(null);
      setActionMessage({ text: `Saved "${trimmedName}" (${formatBytes(blob.size)}) to ${currentPath}.`, type: 'success' });
    } catch (err) {
      setEditor((prev) => (prev ? { ...prev, isSaving: false, error: err instanceof Error ? err.message : String(err) } : null));
    }
  };

  const transferError = (verb: string, name: string, err: unknown) => {
    if (err instanceof TransferCancelled) {
      setActionMessage({ text: `${verb} of "${name}" cancelled.`, type: 'info' });
    } else {
      setActionMessage({ text: `${verb} of "${name}" failed: ${err instanceof Error ? err.message : err}`, type: 'error' });
    }
  };

  const handleDownloadItems = async (itemsToDownload: RemoteFileItem[]) => {
    if (transfer || itemsToDownload.length === 0) return;
    const controller = new AbortController();
    setActionMessage(null);

    // Single regular file download
    if (itemsToDownload.length === 1 && !itemsToDownload[0].isDir) {
      const item = itemsToDownload[0];
      setTransfer({ label: `Downloading "${item.name}"`, done: 0, total: item.sizeBytes ?? null, controller });
      try {
        const channel = await getChannel();
        const data = await channel.download(
          item.path,
          (done, total) => setTransfer((t) => (t ? { ...t, done, total } : t)),
          controller.signal,
          item.sizeBytes
        );
        saveBlob(new Blob([data]), item.name);
        setActionMessage({ text: `Downloaded "${item.name}" (${formatBytes(data.length)}).`, type: 'success' });
      } catch (err) {
        transferError('Download', item.name, err);
      } finally {
        setTransfer(null);
      }
      return;
    }

    // Folder or multi-item download: first try fast endpoint-side native ZIP creation!
    const zipBaseName = itemsToDownload.length === 1
      ? `${itemsToDownload[0].name}.zip`
      : `${device.hostname || 'files'}_${itemsToDownload.length}_items.zip`;
    const tempZipName = `.apex_dl_${Date.now()}.zip`;
    const tempZipPath = isWindows
      ? `C:\\Windows\\Temp\\${tempZipName}`
      : `/tmp/${tempZipName}`;

    setTransfer({ label: `Compressing "${zipBaseName}" on endpoint…`, done: 0, total: null, controller });
    try {
      const channel = await getChannel();
      try {
        await channel.createZipOnEndpoint(currentPath, itemsToDownload.map((i) => i.name), tempZipPath);
        if (controller.signal.aborted) throw new TransferCancelled();
        setTransfer({ label: `Downloading "${zipBaseName}"…`, done: 0, total: null, controller });
        const zipBytes = await channel.download(
          tempZipPath,
          (done, total) => setTransfer((t) => (t ? { ...t, done, total } : t)),
          controller.signal
        );
        const tempDir = isWindows ? 'C:\\Windows\\Temp' : '/tmp';
        channel.rm(tempDir, [tempZipName]).catch(() => {});
        saveBlob(new Blob([zipBytes]), zipBaseName);
        setActionMessage({
          text: `Downloaded "${zipBaseName}" (${formatBytes(zipBytes.length)}).`,
          type: 'success'
        });
        return;
      } catch (nativeZipErr) {
        if (nativeZipErr instanceof TransferCancelled) throw nativeZipErr;
        // Fallback to walking & browser-side zipping if single folder
        if (itemsToDownload.length !== 1) throw nativeZipErr;
      }

      const item = itemsToDownload[0];
      const walker = await getChannel();
      const rows: { Rel: string; Length: number; Modified?: string }[] = [];
      const pending: string[] = [''];
      let walkedBytes = 0;
      while (pending.length > 0) {
        if (controller.signal.aborted) throw new TransferCancelled();
        const rel = pending.shift()!;
        const abs = rel ? joinPath(item.path, rel, isWindows) : item.path;
        setTransfer((t) => (t ? { ...t, label: `Scanning "${item.name}"… ${rows.length} files found` } : t));
        const entries = await walker.ls(abs);
        if (!entries) throw new Error(`can't read ${abs} (access denied?).`);
        for (const e of entries) {
          const childRel = rel ? `${rel}/${e.n}` : e.n;
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

      const entries: ZipEntry[] = [];
      let doneBefore = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        setTransfer({ label: `Downloading "${item.name}" (file ${i + 1} of ${rows.length})`, done: doneBefore, total: totalBytes, controller });
        const data = await channel.download(
          joinPath(item.path, r.Rel, isWindows),
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
      transferError('Download', zipBaseName, err);
    } finally {
      setTransfer(null);
    }
  };

  const queueUploadItems = (items: { file: File; relPath: string }[]) => {
    if (items.length === 0) return;
    const existing = new Set(files.map((f) => f.name.toLowerCase()));
    const topNames = Array.from(new Set(items.map((i) => i.relPath.split('/')[0])));
    const conflicts = topNames.filter((n) => existing.has(n.toLowerCase()));
    if (conflicts.length > 0) setPendingUpload({ items, conflicts });
    else startUpload(items);
  };

  const queueUpload = (list: FileList | null, asFolder: boolean) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map((file) => ({
      file,
      relPath: (asFolder && file.webkitRelativePath ? file.webkitRelativePath : file.name)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
    }));
    queueUploadItems(items);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (transfer || isLoading || !!loadError) return;

    const dtItems = e.dataTransfer?.items;
    if (dtItems && dtItems.length > 0 && typeof dtItems[0].webkitGetAsEntry === 'function') {
      const collected: { file: File; relPath: string }[] = [];
      const readEntry = async (entry: any, prefix: string): Promise<void> => {
        if (entry.isFile) {
          await new Promise<void>((resolve) => {
            entry.file((file: File) => {
              collected.push({ file, relPath: prefix ? `${prefix}/${file.name}` : file.name });
              resolve();
            }, () => resolve());
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const allEntries: any[] = [];
          while (true) {
            const batch: any[] = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
            if (!batch || batch.length === 0) break;
            allEntries.push(...batch);
          }
          for (const child of allEntries) {
            await readEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name);
          }
        }
      };
      const topEntries: any[] = [];
      for (let i = 0; i < dtItems.length; i++) {
        const en = dtItems[i].webkitGetAsEntry();
        if (en) topEntries.push(en);
      }
      for (const en of topEntries) {
        await readEntry(en, '');
      }
      if (collected.length > 0) {
        queueUploadItems(collected);
        return;
      }
    }

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      queueUpload(e.dataTransfer.files, false);
    }
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
      const dirs = Array.from(new Set(
        items.flatMap((i) => {
          const parts = i.relPath.split('/').slice(0, -1);
          return parts.map((_, k) => parts.slice(0, k + 1).join('/'));
        })
      )).sort((a, b) => a.split('/').length - b.split('/').length);
      const known = new Map<string, Set<string>>();
      for (const rel of dirs) {
        const parts = rel.split('/');
        const name = parts.pop()!;
        const parentAbs = parts.length ? joinPath(target, parts.join('/'), isWindows) : target;
        const parentKey = isWindows ? parentAbs.toLowerCase() : parentAbs;
        let names = known.get(parentKey);
        if (!names) {
          const entries = await channel.ls(parentAbs);
          if (!entries) throw new Error(`can't read ${parentAbs} (access denied?).`);
          names = new Set(entries.map((e) => (isWindows ? e.n.toLowerCase() : e.n)));
          known.set(parentKey, names);
        }
        const nameKey = isWindows ? name.toLowerCase() : name;
        if (!names.has(nameKey)) {
          const newDirAbs = joinPath(parentAbs, name, isWindows);
          await channel.mkdir(newDirAbs);
          names.add(nameKey);
          known.set(isWindows ? newDirAbs.toLowerCase() : newDirAbs, new Set());
        }
      }
      let doneBefore = 0;
      for (let i = 0; i < items.length; i++) {
        const { file, relPath } = items[i];
        setTransfer({ label: `Uploading "${file.name}" (${i + 1} of ${items.length})`, done: doneBefore, total: totalBytes, controller });
        await channel.upload(
          joinPath(target, relPath, isWindows),
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

  const formatSize = (bytes?: number): string => {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  };

  const quickShortcuts = useMemo(() => {
    if (isWindows) {
      return [
        { label: 'ApexMSP', path: 'C:\\ProgramData\\ApexMSP' },
        { label: 'Users', path: 'C:\\Users' },
        { label: 'Desktop', path: 'C:\\Users\\Administrator\\Desktop' },
        { label: 'Program Files', path: 'C:\\Program Files' },
        { label: 'Temp', path: 'C:\\Windows\\Temp' }
      ];
    }
    if (isMac) {
      return [
        { label: '/', path: '/' },
        { label: 'Users', path: '/Users' },
        { label: 'Applications', path: '/Applications' },
        { label: 'ApexMSP', path: '/Library/Application Support/ApexMSP' },
        { label: 'Temp', path: '/tmp' }
      ];
    }
    return [
      { label: '/', path: '/' },
      { label: 'home', path: '/home' },
      { label: 'etc', path: '/etc' },
      { label: 'var/log', path: '/var/log' },
      { label: 'tmp', path: '/tmp' }
    ];
  }, [isWindows, isMac]);

  const terminalListingCmd = isWindows
    ? `Get-ChildItem -LiteralPath '${currentPath.replace(/'/g, "''")}'`
    : `ls -la '${currentPath.replace(/'/g, "'\\''")}'`;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={handleDrop}
      className="relative flex flex-col h-full bg-[#0a0e17] text-slate-200 overflow-hidden select-none font-sans"
    >
      {/* Drag-and-Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-2 z-40 rounded-xl border-2 border-dashed border-sky-400 bg-sky-950/80 backdrop-blur-xs flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-10 h-10 text-sky-400 mb-2 animate-bounce" />
          <div className="text-sm font-bold text-white">Drop files or folders to upload</div>
          <div className="text-xs font-mono text-sky-300 mt-1">{currentPath}</div>
        </div>
      )}

      {/* Top Address, Breadcrumb & Navigation Bar */}
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

          {editingPathBar ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigateTo(pathInput);
              }}
              className="flex-1 flex items-center gap-1.5"
            >
              <div className="relative w-full">
                <HardDrive className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  autoFocus
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onBlur={() => setEditingPathBar(false)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-blue-500 rounded-lg text-xs font-mono text-slate-200 focus:outline-none transition"
                />
              </div>
            </form>
          ) : (
            <div
              onClick={() => {
                setPathInput(currentPath);
                setEditingPathBar(true);
              }}
              title="Click to type a custom path"
              className="flex-1 flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:border-slate-600 border border-slate-700/80 rounded-lg text-xs font-mono text-slate-200 overflow-x-auto custom-scrollbar cursor-text"
            >
              <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1" />
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(crumb.path);
                    }}
                    className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-200 hover:text-sky-300 transition whitespace-nowrap"
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              navigateTo(currentPath);
              refreshDrives();
            }}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700"
            title="Refresh current directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>

        {/* File Transfer & Actions Toolbar */}
        {isSupportedOs && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!transfer || isLoading || !!loadError}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                title={`Upload files into ${currentPath} (or drag & drop)`}
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" /> Upload file
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={!!transfer || isLoading || !!loadError}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                title={`Upload a folder into ${currentPath}`}
              >
                <FolderUp className="w-3.5 h-3.5 text-amber-400" /> Upload folder
              </button>
              <button
                onClick={handleOpenAddFolder}
                disabled={!!transfer || isLoading || !!loadError}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                title={`Create a new folder in ${currentPath}`}
              >
                <FolderPlus className="w-3.5 h-3.5 text-emerald-400" /> New folder
              </button>
              <button
                onClick={handleOpenNewFile}
                disabled={!!transfer || isLoading || !!loadError}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                title={`Create a new text/script file in ${currentPath}`}
              >
                <FilePlus className="w-3.5 h-3.5 text-teal-400" /> New file
              </button>

              {selectedItems.length > 0 && (
                <>
                  <button
                    onClick={() => handleDownloadItems(selectedItems)}
                    disabled={!!transfer || isBusyOp}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg border border-blue-500 text-[11px] font-semibold flex items-center gap-1.5 transition"
                    title="Download selected item(s)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {selectedItems.length === 1
                      ? `Download ${selectedItems[0].isDir ? '(.zip)' : ''}`
                      : `Download (${selectedItems.length}) as .zip`}
                  </button>

                  {primarySelected && !primarySelected.isDir && (EDITABLE_EXT_RE.test(primarySelected.name) || (primarySelected.sizeBytes ?? 0) < 256 * 1024) && (
                    <button
                      onClick={() => handleOpenEditor(primarySelected)}
                      disabled={!!transfer || isBusyOp}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg border border-emerald-800/70 text-[11px] font-semibold flex items-center gap-1.5 transition"
                      title={`View / Edit ${primarySelected.name}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}

                  {primarySelected && (
                    <button
                      onClick={() => handleOpenRename(primarySelected)}
                      disabled={!!transfer || isBusyOp}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                      title={`Rename ${primarySelected.name}`}
                    >
                      <Type className="w-3.5 h-3.5 text-sky-400" /> Rename
                    </button>
                  )}

                  <button
                    onClick={() => handleCopyOrCut('copy', selectedItems)}
                    disabled={!!transfer || isBusyOp}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1 transition"
                    title="Copy selected item(s)"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy
                  </button>

                  <button
                    onClick={() => handleCopyOrCut('move', selectedItems)}
                    disabled={!!transfer || isBusyOp}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-semibold flex items-center gap-1 transition"
                    title="Cut / Move selected item(s)"
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-400" /> Cut
                  </button>

                  <button
                    onClick={() => handleCompressOnEndpoint(selectedItems)}
                    disabled={!!transfer || isBusyOp}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg border border-purple-800/70 text-[11px] font-semibold flex items-center gap-1 transition"
                    title="Compress selected item(s) to a .zip archive on the endpoint"
                  >
                    <FileArchive className="w-3.5 h-3.5" /> Zip
                  </button>

                  {primarySelected && /\.zip$/i.test(primarySelected.name) && (
                    <button
                      onClick={() => handleExtractZip(primarySelected)}
                      disabled={!!transfer || isBusyOp}
                      className="px-2.5 py-1 bg-purple-950/70 hover:bg-purple-900/80 text-purple-200 rounded-lg border border-purple-700 text-[11px] font-semibold flex items-center gap-1.5 transition"
                      title={`Extract ${primarySelected.name} directly on the device`}
                    >
                      <PackageOpen className="w-3.5 h-3.5 text-purple-300" /> Extract Here
                    </button>
                  )}

                  <button
                    onClick={() => setConfirmDelete(selectedItems)}
                    disabled={!!transfer || isBusyOp}
                    className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 rounded-lg border border-rose-800/70 text-[11px] font-semibold flex items-center gap-1 transition"
                    title="Delete selected item(s)"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedItems.length})
                  </button>
                </>
              )}

              {clipboard && (
                <button
                  onClick={handlePaste}
                  disabled={!!transfer || isBusyOp}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg border border-amber-400 text-[11px] font-bold flex items-center gap-1.5 transition"
                  title={`Paste ${clipboard.items.length} ${clipboard.mode === 'move' ? 'cut' : 'copied'} item(s) into ${currentPath}`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste ({clipboard.items.length})
                </button>
              )}

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

            <div className="flex items-center gap-2">
              {channelMode && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${
                    channelMode === 'mesh'
                      ? 'bg-emerald-950/50 border-emerald-800/70 text-emerald-300'
                      : 'bg-sky-950/50 border-sky-800/70 text-sky-300'
                  }`}
                  title={
                    channelMode === 'mesh'
                      ? 'Connected over live ApexConnect high-speed file relay'
                      : 'Connected over live ApexMSP App Agent'
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {channelMode === 'mesh' ? 'ApexConnect Live' : 'ApexMSP App Live'}
                </span>
              )}
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter folder…"
                  className="pl-7 pr-6 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36 sm:w-44 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    title="Clear filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mounted Drives + Quick Shortcuts Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs">
          {drives.length > 0 && (
            <>
              <span className="text-[10px] text-sky-400 uppercase font-bold tracking-wider mr-0.5">Drives:</span>
              {drives.map((drv) => {
                const isActiveDrive = isWindows && currentPath.toUpperCase().startsWith(drv.letter.toUpperCase());
                return (
                  <button
                    key={drv.path}
                    onClick={() => navigateTo(drv.path)}
                    title={
                      drv.freeBytes != null && drv.totalBytes != null
                        ? `${drv.letter} ${drv.label ? `(${drv.label}) ` : ''}— ${formatBytes(drv.freeBytes)} free of ${formatBytes(drv.totalBytes)}`
                        : `${drv.letter} ${drv.label || ''}`
                    }
                    className={`px-2 py-0.5 rounded border text-[11px] font-mono transition whitespace-nowrap flex items-center gap-1 ${
                      isActiveDrive
                        ? 'bg-sky-950/80 border-sky-600 text-sky-200 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    <HardDrive className="w-3 h-3 text-sky-400" />
                    <span>{drv.letter}</span>
                    {drv.label && <span className="text-[10px] text-slate-400 font-sans">({drv.label})</span>}
                  </button>
                );
              })}
              <span className="text-slate-700 mx-1">|</span>
            </>
          )}
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mr-0.5">Jump:</span>
          {quickShortcuts.map((sc) => (
            <button
              key={sc.path}
              onClick={() => navigateTo(sc.path)}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[11px] font-mono transition whitespace-nowrap"
            >
              {sc.label}
            </button>
          ))}
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

      {/* Sortable Table Header with Multi-Select Checkbox */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0d111d] border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 items-center">
        <div className="col-span-6 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={filteredFiles.length > 0 && selectedPaths.size === filteredFiles.length}
            onChange={toggleSelectAll}
            className="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-0 cursor-pointer"
            title="Select all items in folder"
          />
          <button
            type="button"
            onClick={() => handleSort('name')}
            className="flex items-center gap-1 hover:text-slate-200 transition cursor-pointer"
          >
            <span>Name</span>
            {sortField === 'name' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-sky-400" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400" />)}
          </button>
        </div>
        <div className="col-span-2 flex justify-end">
          <button
            type="button"
            onClick={() => handleSort('size')}
            className="flex items-center gap-1 hover:text-slate-200 transition cursor-pointer"
          >
            <span>Size</span>
            {sortField === 'size' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-sky-400" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400" />)}
          </button>
        </div>
        <div className="col-span-2 flex items-center">
          <button
            type="button"
            onClick={() => handleSort('modified')}
            className="flex items-center gap-1 hover:text-slate-200 transition cursor-pointer"
          >
            <span>Modified</span>
            {sortField === 'modified' && (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-sky-400" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400" />)}
          </button>
        </div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Files Table Rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/60 text-xs font-mono">
        {filteredFiles.map((file) => {
          const lower = file.name.toLowerCase();
          const isSelected = selectedPaths.has(file.path);
          const isZip = /\.zip$/i.test(lower);
          const isEditable = !file.isDir && (EDITABLE_EXT_RE.test(lower) || (file.sizeBytes ?? 0) < 128 * 1024);

          return (
            <div
              key={file.path}
              onClick={(e) => toggleSelectItem(file.path, e.metaKey || e.ctrlKey || e.shiftKey)}
              onDoubleClick={() => {
                if (file.isDir) navigateTo(file.path);
                else if (isEditable) handleOpenEditor(file);
              }}
              className={`grid grid-cols-12 gap-2 px-3 py-2 items-center transition cursor-pointer group ${
                isSelected ? 'bg-blue-950/60 ring-1 ring-inset ring-blue-700' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="col-span-6 flex items-center gap-2.5 min-w-0 pr-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelectItem(file.path, true)}
                  className="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-0 cursor-pointer shrink-0"
                />
                {file.isDir ? (
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                ) : /\.(exe|msi|pkg|dmg|sh|command|py|ps1|bat|cmd)$/.test(lower) ? (
                  <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                ) : /\.(zip|tar|gz|tgz|7z|rar)$/.test(lower) ? (
                  <Archive className="w-4 h-4 text-purple-400 shrink-0" />
                ) : EDITABLE_EXT_RE.test(lower) ? (
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
                <div className="flex items-center justify-end gap-0.5">
                  {isEditable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditor(file);
                      }}
                      disabled={!!transfer || isBusyOp}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-emerald-300 transition"
                      title={`View / Edit ${file.name}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isZip && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExtractZip(file);
                      }}
                      disabled={!!transfer || isBusyOp}
                      className="p-1 rounded hover:bg-purple-950/80 disabled:opacity-30 text-purple-400 hover:text-purple-200 transition"
                      title={`Extract ${file.name} here`}
                    >
                      <PackageOpen className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenRename(file);
                    }}
                    disabled={!!transfer || isBusyOp}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-sky-300 transition"
                    title={`Rename ${file.name}`}
                  >
                    <Type className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadItems([file]);
                    }}
                    disabled={!!transfer || isBusyOp}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-white transition"
                    title={file.isDir ? `Download ${file.name} as .zip` : `Download ${file.name}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete([file]);
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

        {!isSupportedOs ? (
          <BackstageLiveStatus state="unsupported" deviceName={device.name} what="file browsing" />
        ) : isLoading && files.length === 0 ? (
          <BackstageLiveStatus state="loading" deviceName={device.name} what={currentPath} />
        ) : loadError ? (
          <BackstageLiveStatus state="error" deviceName={device.name} what={currentPath} error={loadError} onRetry={() => navigateTo(currentPath)} />
        ) : filteredFiles.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-sans">
            <Folder className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <div className="font-bold text-slate-400">{searchQuery ? 'No matching items' : 'Folder is empty'}</div>
            <div className="text-xs text-slate-600 mt-1">{currentPath} · Drag & drop files here to upload</div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#090c14] border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span>
          <strong className="text-slate-200 font-mono">{currentPath}</strong> ({filteredFiles.length} items
          {selectedPaths.size > 0 ? `, ${selectedPaths.size} selected` : ''}) · Double-click folder to open or text file to edit · Drag & drop to upload
        </span>

        {onOpenTerminalWithCommand && (
          <button
            onClick={() => onOpenTerminalWithCommand(terminalListingCmd)}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
          >
            <span>Open in Terminal</span>
          </button>
        )}
      </div>

      {/* Add Folder Modal */}
      {showAddFolder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-[#111625] border border-emerald-800/80 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200 font-sans"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
                <FolderPlus className="w-5 h-5 shrink-0" />
                <span>Add New Folder</span>
              </div>
              <button
                type="button"
                onClick={() => !isCreatingFolder && setShowAddFolder(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Folder Name
              </label>
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  if (newFolderError) setNewFolderError(null);
                }}
                disabled={isCreatingFolder}
                placeholder="e.g. Deployments"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800 font-mono break-all">
              <span className="text-slate-500 font-sans">Target path: </span>
              {joinPath(currentPath, newFolderName.trim() || 'NewFolder', isWindows)}
            </div>

            {newFolderError && (
              <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded-lg px-3 py-2">
                {newFolderError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddFolder(false)}
                disabled={isCreatingFolder}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingFolder || !newFolderName.trim()}
                className="disabled:opacity-50 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{isCreatingFolder ? 'Creating…' : 'Create Folder'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="bg-[#111625] border border-sky-800/80 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200 font-sans"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-sky-400 font-bold text-base">
                <Type className="w-5 h-5 shrink-0" />
                <span>Rename {renameTarget.isDir ? 'Folder' : 'File'}</span>
              </div>
              <button
                type="button"
                onClick={() => !isRenaming && setRenameTarget(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                New Name
              </label>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  if (renameError) setRenameError(null);
                }}
                disabled={isRenaming}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            {renameError && (
              <div className="text-xs text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded-lg px-3 py-2">
                {renameError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                disabled={isRenaming}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRenaming || !renameValue.trim()}
                className="disabled:opacity-50 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                {isRenaming ? 'Renaming…' : 'Rename'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* In-Browser File Viewer / Editor Modal */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditor}
            className="bg-[#0e1320] border border-slate-700 rounded-xl max-w-4xl w-full h-[80vh] flex flex-col shadow-2xl overflow-hidden text-slate-200 font-sans"
          >
            <div className="px-4 py-3 bg-[#111728] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                {editor.isNew ? (
                  <input
                    type="text"
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    placeholder="filename.txt"
                    className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                ) : (
                  <span className="font-mono text-xs font-bold text-white truncate">{editor.path}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={editor.isSaving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editor.isSaving ? 'Saving…' : 'Save to Device'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => !editor.isSaving && setEditor(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {editor.error && (
              <div className="px-4 py-2 text-xs text-rose-300 bg-rose-950/70 border-b border-rose-800 shrink-0">
                {editor.error}
              </div>
            )}

            <textarea
              value={editor.content}
              onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              spellCheck={false}
              className="flex-1 w-full p-4 bg-[#090d16] text-slate-100 font-mono text-xs leading-relaxed resize-none focus:outline-none custom-scrollbar"
              placeholder="Enter file contents…"
            />

            <div className="px-4 py-2 bg-[#090c14] border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
              <span>{editor.content.split('\n').length} lines · {formatBytes(new Blob([editor.content]).size)}</span>
              <span>{editor.content !== editor.originalContent ? 'Unsaved changes' : 'Up to date'}</span>
            </div>
          </form>
        </div>
      )}

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
      {confirmDelete && confirmDelete.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111625] border border-rose-800/80 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200 animate-fadeIn font-sans">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-base">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span>
                Delete {confirmDelete.length === 1
                  ? `Remote ${confirmDelete[0].isDir ? 'Folder' : 'File'}`
                  : `${confirmDelete.length} Items`}?
              </span>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed font-mono">
              Are you sure you want to permanently delete:
              <div className="text-white mt-1.5 break-all bg-slate-900 p-2 rounded border border-slate-800 max-h-36 overflow-y-auto space-y-1">
                {confirmDelete.map((it) => (
                  <div key={it.path} className="truncate">{it.path}</div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItems(confirmDelete)}
                disabled={isDeleting}
                className="disabled:opacity-50 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting…' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
