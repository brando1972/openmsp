import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../data/AppContext';
import {
  api,
  type BackupOverviewResponse,
  type BackupStorageVault,
  type BackupPolicy,
  type BackupSnapshot,
  type BackupJob,
  type BareMetalRecoverySession,
  type BackupEndpointAgentEntry,
  type B2TenantKeyRecord,
  type BackupMode,
  type BackupStorageBackendType
} from '../../services/api';
import {
  HardDrive,
  Database,
  Cloud,
  ShieldCheck,
  Lock,
  RefreshCw,
  Play,
  CheckCircle2,
  Clock,
  Server,
  Terminal,
  FolderOpen,
  Layers,
  Cpu,
  KeyRound,
  Plus,
  X,
  ArrowRight,
  Zap,
  Search,
  Copy,
  Disc,
  RotateCcw,
  Activity,
  Sparkles,
  TrendingUp
} from 'lucide-react';

type BackupSubTab =
  | 'backups-overview'
  | 'backups-snapshots'
  | 'backups-vaults'
  | 'backups-policies'
  | 'backups-bmr'
  | 'backups-agents';

const VALID_BACKUP_TABS: BackupSubTab[] = [
  'backups-overview',
  'backups-snapshots',
  'backups-vaults',
  'backups-policies',
  'backups-bmr',
  'backups-agents'
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const MODE_LABELS: Record<BackupMode, { badge: string; short: string; color: string; dot: string }> = {
  file_object_dedup: {
    badge: 'Phase 1 • File/Object Dedup',
    short: 'File CDC Dedup',
    color: 'bg-sky-500/15 text-sky-300 border-sky-400/25',
    dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]'
  },
  volume_snapshot_vss: {
    badge: 'Phase 2 • Atomic VSS/APFS/LVM',
    short: 'Atomic Volume VSS',
    color: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/25',
    dot: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
  },
  bare_metal_image: {
    badge: 'Phase 3 • Bare-Metal + EFI',
    short: 'Bare-Metal Image',
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
  }
};

const BMR_STAGE_PIPELINE: Array<{
  key: BareMetalRecoverySession['status'];
  label: string;
  sub: string;
}> = [
  { key: 'awaiting_iso_boot', label: 'Awaiting ISO Boot', sub: 'WinPE / Alpine Live ISO PXE or USB' },
  { key: 'iso_paired', label: 'ISO Paired', sub: '6-digit code authenticated via TLS' },
  { key: 'partitioning_disks', label: 'Partitioning GPT/UEFI', sub: 'Restoring sfdisk / DiskPart layout' },
  { key: 'streaming_dedup_blocks', label: 'Streaming Deduplicated Chunks', sub: '10GbE LAN Zstd block rehydration' },
  { key: 'repairing_bootloader', label: 'Injecting VirtIO & Repairing BCD/GRUB', sub: 'efibootmgr / bcdboot + VirtIO SCSI' },
  { key: 'completed', label: 'Completed', sub: 'System bootable & verified' }
];

export const BackupDashboardView: React.FC = () => {
  const { activeSubRailView, setActiveSubRailView, selectedClientId, clients } = useApp();

  const currentTab: BackupSubTab = VALID_BACKUP_TABS.includes(activeSubRailView as BackupSubTab)
    ? (activeSubRailView as BackupSubTab)
    : 'backups-overview';

  const setSubTab = (tab: BackupSubTab) => {
    setActiveSubRailView(tab);
  };

  const [loading, setLoading] = useState<boolean>(true);
  const [overview, setOverview] = useState<BackupOverviewResponse | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [overviewTableMode, setOverviewTableMode] = useState<'streams' | 'snapshots' | 'pipeline'>('streams');

  // Snapshot Browser & Filter state
  const [snapClientFilter, setSnapClientFilter] = useState<string>('all');
  const [snapDeviceFilter, setSnapDeviceFilter] = useState<string>('all');
  const [snapModeFilter, setSnapModeFilter] = useState<BackupMode | 'all'>('all');
  const [snapSearchQuery, setSnapSearchQuery] = useState<string>('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('snap-bmr-gambinos-c1-01');
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>(['C:/KwickPOS/db/orders_local_journal.sqlite']);
  const [restoreTargetPath, setRestoreTargetPath] = useState<string>('C:\\Restored\\KwickPOS_Recovery');

  // Modals / Drawers state
  const [showRunBackupModal, setShowRunBackupModal] = useState<boolean>(false);
  const [runBackupDeviceId, setRunBackupDeviceId] = useState<string>('dev-gambinos-c1');
  const [runBackupMode, setRunBackupMode] = useState<BackupMode>('bare_metal_image');
  const [runBackupIncludePath, setRunBackupIncludePath] = useState<string>('C:\\KwickPOS, C:\\Users');

  const [showNewBmrModal, setShowNewBmrModal] = useState<boolean>(false);
  const [newBmrSnapshotId, setNewBmrSnapshotId] = useState<string>('snap-bmr-gambinos-c1-01');
  const [newBmrProfile, setNewBmrProfile] = useState<BareMetalRecoverySession['targetHardwareProfile']>('proxmox_vm_p2v');
  const [newBmrBootloader, setNewBmrBootloader] = useState<'uefi_gpt' | 'bios_mbr'>('uefi_gpt');
  const [newBmrVirtio, setNewBmrVirtio] = useState<boolean>(true);

  const [showAddVaultModal, setShowAddVaultModal] = useState<boolean>(false);
  const [newVaultName, setNewVaultName] = useState<string>('UniFi UNAS Pro Secondary Vault (Site-2)');
  const [newVaultBackend, setNewVaultBackend] = useState<BackupStorageBackendType>('unifi_nas_kopia');
  const [newVaultEndpoint, setNewVaultEndpoint] = useState<string>('https://kopia-gw2.apexmsp.lan:51515');
  const [newVaultNfsOrBucket, setNewVaultNfsOrBucket] = useState<string>('/volume1/apexvault_site2');
  const [newVaultRetentionDays, setNewVaultRetentionDays] = useState<number>(90);

  const [showNewPolicyModal, setShowNewPolicyModal] = useState<boolean>(false);
  const [newPolicyName, setNewPolicyName] = useState<string>('Phase 3: Nightly Bare-Metal + VSS Immutable');
  const [newPolicyClientId, setNewPolicyClientId] = useState<string>('c-gambinos');
  const [newPolicyMode, setNewPolicyMode] = useState<BackupMode>('bare_metal_image');
  const [newPolicyCron, setNewPolicyCron] = useState<string>('0 2 * * *');
  const [newPolicyScheduleLabel, setNewPolicyScheduleLabel] = useState<string>('Daily at 02:00 AM');
  const [newPolicyPaths, setNewPolicyPaths] = useState<string>('C:\\Users, C:\\KwickPOS, /etc');
  const [newPolicyLockDays, setNewPolicyLockDays] = useState<number>(90);
  const [newPolicyVss, setNewPolicyVss] = useState<boolean>(true);
  const [newPolicyApfs, setNewPolicyApfs] = useState<boolean>(true);
  const [newPolicyLvm, setNewPolicyLvm] = useState<boolean>(true);
  const [newPolicyPartition, setNewPolicyPartition] = useState<boolean>(true);
  const [newPolicyEfi, setNewPolicyEfi] = useState<boolean>(true);

  // B2 Cost Calculator & Tenant Key Provisioner state
  const [b2CalcTb, setB2CalcTb] = useState<number>(10);
  const [b2KeyTenantId, setB2KeyTenantId] = useState<string>('c-gambinos');
  const [b2KeyBucketName, setB2KeyBucketName] = useState<string>('apexmsp-worm-vault-prod');

  const showToastMsg = (type: 'success' | 'warn' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const loadBackupData = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const clientFilter = selectedClientId === 'all' ? undefined : selectedClientId;
      const res = await api.getBackupOverview(clientFilter);
      setOverview(res);
      if (res.snapshots.length > 0 && !res.snapshots.some(s => s.id === selectedSnapshotId)) {
        setSelectedSnapshotId(res.snapshots[0].id);
      }
    } catch (err: any) {
      if (!silent) {
        showToastMsg('error', `Failed to load backup overview: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedClientId, selectedSnapshotId]);

  useEffect(() => {
    loadBackupData(false);
    const interval = setInterval(() => {
      loadBackupData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadBackupData]);

  const vaults: BackupStorageVault[] = overview?.vaults || [];
  const policies: BackupPolicy[] = overview?.policies || [];
  const snapshots: BackupSnapshot[] = overview?.snapshots || [];
  const jobs: BackupJob[] = overview?.jobs || [];
  const bmrSessions: BareMetalRecoverySession[] = overview?.bareMetalSessions || [];
  const endpointAgents: BackupEndpointAgentEntry[] = overview?.endpointAgents || [];
  const b2Keys: B2TenantKeyRecord[] = overview?.b2ProvisionedKeys || [];

  const filteredSnapshots = snapshots.filter(snap => {
    if (snapClientFilter !== 'all' && snap.clientId !== snapClientFilter) return false;
    if (snapDeviceFilter !== 'all' && snap.deviceId !== snapDeviceFilter) return false;
    if (snapModeFilter !== 'all' && snap.mode !== snapModeFilter) return false;
    if (snapSearchQuery.trim()) {
      const q = snapSearchQuery.toLowerCase();
      const matchDevice = snap.deviceName.toLowerCase().includes(q);
      const matchClient = snap.clientName.toLowerCase().includes(q);
      const matchHash = snap.sha256RootHash.toLowerCase().includes(q);
      const matchManifest = snap.manifestId.toLowerCase().includes(q);
      const matchFile = snap.filesPreview?.some(f => f.path.toLowerCase().includes(q));
      if (!matchDevice && !matchClient && !matchHash && !matchManifest && !matchFile) return false;
    }
    return true;
  });

  const activeSnapshot: BackupSnapshot | undefined =
    filteredSnapshots.find(s => s.id === selectedSnapshotId) ||
    snapshots.find(s => s.id === selectedSnapshotId) ||
    filteredSnapshots[0] ||
    snapshots[0];

  // Action Handlers
  const handleTriggerBackup = async (deviceId: string, mode: BackupMode, customPaths?: string[]) => {
    const key = `trigger:${deviceId}:${mode}`;
    setBusyAction(key);
    try {
      const agent = endpointAgents.find(a => a.deviceId === deviceId);
      const res = await api.triggerBackupSnapshot({
        deviceId,
        deviceName: agent?.hostname,
        clientId: agent?.clientId,
        clientName: agent?.clientName,
        os: agent?.os,
        mode,
        includePaths: customPaths,
        enableVss: mode !== 'file_object_dedup',
        captureBareMetalEfi: mode === 'bare_metal_image'
      });
      setSelectedSnapshotId(res.snapshot.id);
      showToastMsg(
        'success',
        `Completed ${MODE_LABELS[mode].short} on ${res.snapshot.deviceName} • Manifest ${res.snapshot.manifestId.slice(0, 10)}...`
      );
      setShowRunBackupModal(false);
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Backup trigger failed: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifySnapshot = async (snapshotId: string) => {
    const key = `verify:${snapshotId}`;
    setBusyAction(key);
    try {
      const res = await api.verifyBackupSnapshot(snapshotId);
      showToastMsg(
        'success',
        `SHA-256 Chunk Scrub Verified (${res.snapshot.sha256RootHash.slice(0, 16)}...) — 0 Corrupted Packs`
      );
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Verification failed: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!restoreTargetPath.trim()) {
      showToastMsg('warn', 'Please specify a restore destination path');
      return;
    }
    const key = `restore:${snapshotId}`;
    setBusyAction(key);
    try {
      const res = await api.restoreBackupSnapshot(snapshotId, {
        targetPath: restoreTargetPath.trim(),
        selectedPaths: selectedFilePaths.length > 0 ? selectedFilePaths : undefined,
        verifyIntegrityFirst: true
      });
      showToastMsg(
        'success',
        `Restore Job ${res.job.jobNumber} Completed → ${restoreTargetPath} (${selectedFilePaths.length || 'All'} items)`
      );
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Restore failed: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncToB2 = async (vaultId: string = 'vault-unifi-unas-pro-01') => {
    const key = `sync:${vaultId}`;
    setBusyAction(key);
    try {
      const res = await api.syncVaultToB2(vaultId);
      showToastMsg(
        'success',
        `Synced UniFi UNAS Pro → Backblaze B2 (${res.job.jobNumber}) at ${res.job.transferRateMbps} Mbps with COMPLIANCE Object Lock`
      );
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Cloud sync failed: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleMintB2Key = async () => {
    const key = `b2key:${b2KeyTenantId}`;
    setBusyAction(key);
    try {
      const clientObj = clients.find(c => c.id === b2KeyTenantId);
      const clientName =
        clientObj?.name ||
        (b2KeyTenantId === 'c-gambinos'
          ? 'Gambinos'
          : b2KeyTenantId === 'c-municipality'
          ? 'City of Auburn Utilities'
          : b2KeyTenantId === 'c-tbi'
          ? 'The Broken iPhone (TBI)'
          : 'Raytreat / DevStudio');
      const res = await api.provisionB2TenantKey('vault-backblaze-b2-worm-02', {
        clientId: b2KeyTenantId,
        clientName,
        bucketName: b2KeyBucketName,
        namePrefix: `tenants/${b2KeyTenantId}/`
      });
      showToastMsg(
        'success',
        `Minted Append-Only B2 Application Key ${res.keyRecord.keyId} for ${clientName} (deleteFiles BLOCKED)`
      );
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Failed to mint B2 key: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-vault');
    try {
      const res = await api.createBackupVault({
        name: newVaultName,
        backendType: newVaultBackend,
        endpointUrl: newVaultEndpoint,
        unifiNfsExport: newVaultBackend === 'unifi_nas_kopia' ? newVaultNfsOrBucket : undefined,
        b2BucketName: newVaultBackend !== 'unifi_nas_kopia' ? newVaultNfsOrBucket : undefined,
        immutableObjectLock: true,
        immutableLockMode: 'COMPLIANCE',
        immutableRetentionDays: newVaultRetentionDays,
        appendOnlyEnforced: true
      });
      showToastMsg('success', `Added Storage Vault "${res.vault.name}"`);
      setShowAddVaultModal(false);
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Failed to create vault: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePolicy = async (policy: BackupPolicy, field: keyof BackupPolicy, value: any) => {
    const key = `pol:${policy.id}:${String(field)}`;
    setBusyAction(key);
    try {
      await api.saveBackupPolicy({
        ...policy,
        [field]: value
      });
      showToastMsg('success', `Updated policy "${policy.name}" (${String(field)} = ${String(value)})`);
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Policy update failed: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-policy');
    try {
      const clientObj = clients.find(c => c.id === newPolicyClientId);
      const res = await api.saveBackupPolicy({
        name: newPolicyName,
        clientId: newPolicyClientId,
        clientName: clientObj?.name || 'Gambinos',
        enabled: true,
        mode: newPolicyMode,
        scheduleCron: newPolicyCron,
        scheduleLabel: newPolicyScheduleLabel,
        includePaths: newPolicyPaths.split(',').map(s => s.trim()).filter(Boolean),
        immutableLockDays: newPolicyLockDays,
        enableWindowsVss: newPolicyVss,
        enableApfsSnapshot: newPolicyApfs,
        enableLvmSnapshot: newPolicyLvm,
        capturePartitionTable: newPolicyPartition,
        captureEfiBootloader: newPolicyEfi
      });
      showToastMsg('success', `Saved Backup Policy "${res.policy.name}"`);
      setShowNewPolicyModal(false);
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Failed to save policy: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateBmrSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-bmr');
    try {
      const res = await api.createBareMetalSession({
        snapshotId: newBmrSnapshotId,
        targetHardwareProfile: newBmrProfile,
        bootloaderType: newBmrBootloader,
        injectVirtioDrivers: newBmrVirtio
      });
      showToastMsg(
        'success',
        `Launched Bare-Metal Recovery Session • Live ISO Pairing Code: ${res.session.pairingCode}`
      );
      setShowNewBmrModal(false);
      setSubTab('backups-bmr');
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Failed to launch BMR session: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAdvanceBmrSession = async (sessionId: string) => {
    const key = `adv-bmr:${sessionId}`;
    setBusyAction(key);
    try {
      const res = await api.advanceBareMetalSession(sessionId);
      showToastMsg(
        'success',
        `BMR Session ${res.session.pairingCode} advanced to "${res.session.status.replace(/_/g, ' ').toUpperCase()}" (${res.session.progressPct}%)`
      );
      await loadBackupData();
    } catch (err: any) {
      showToastMsg('error', `Failed to advance session: ${err?.message || 'Error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleFileSelection = (path: string) => {
    setSelectedFilePaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  // Compute live telemetry bars for the Sapphire Blue Right-Rail Bento Card
  const liveSync = overview?.liveSync;
  const totalFiles = liveSync?.filesDiscovered || snapshots.reduce((acc, s) => acc + s.fileCount, 0) || 1;
  const syncedFiles = liveSync?.filesSynced || snapshots.reduce((acc, s) => acc + s.fileCount, 0);
  const filesPct = liveSync ? liveSync.filesProgressPct : 100;
  const bytesMb = liveSync
    ? (liveSync.bytesSynced / (1024 * 1024)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : ((overview?.kpis.storedDeduplicatedBytes || 0) / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 });

  const syncStageBars = [
    { label: 'FAV', pct: 100 },
    { label: 'BKM', pct: 100 },
    { label: 'DSK', pct: 100 },
    { label: 'DOC', pct: Math.min(100, Math.max(38, filesPct * 2.4)) },
    { label: 'PIC', pct: Math.min(100, Math.max(30, filesPct * 1.9)) },
    { label: 'VID', pct: Math.min(100, Math.max(24, filesPct * 1.4)) },
    { label: 'DL', pct: Math.min(100, Math.max(45, filesPct * 2.1)) },
    { label: 'POS', pct: 92 },
    { label: 'CFG', pct: 86 },
    { label: 'WORM', pct: 95 }
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full glass-v18-canvas text-slate-100 overflow-hidden select-text p-2 sm:p-4">
      {/* ===================================================================== */}
      {/* SPATIAL FROSTED GLASS SHELL (GLASSY DASHBOARD V18)                    */}
      {/* ===================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full glass-v18-shell rounded-[28px] overflow-hidden">
        {/* ------------------------------------------------------------------- */}
        {/* TOP GLASS HEADER BAR                                                */}
        {/* ------------------------------------------------------------------- */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            {/* Left: Spatial Brand & Subtitle */}
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400/25 via-blue-500/20 to-indigo-600/30 border border-white/[0.18] shadow-[0_8px_24px_rgba(14,165,233,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold tracking-tight text-white">
                    ApexVault
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Immutable WORM Active
                  </span>
                  {liveSync && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30">
                      <span className={`w-1.5 h-1.5 rounded-full ${liveSync.completed ? 'bg-emerald-400' : 'bg-sky-400 animate-ping'}`} />
                      {liveSync.sourceDeviceName} → {liveSync.targetDeviceName} ({liveSync.averageSpeedMbps} Mbps)
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/55 mt-0.5">
                  Kopia v0.18.2 Client-Side CDC Deduplication • UniFi UNAS Pro 10GbE NFS • Backblaze B2 S3 Object Lock • Live Desktop File Sync
                </p>
              </div>
            </div>

            {/* Right: Search Pill + 3-Tier Action Hierarchy */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Frosted Search Pill */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-white/45 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={snapSearchQuery}
                  onChange={e => setSnapSearchQuery(e.target.value)}
                  placeholder="Search hosts, SHA-256, files..."
                  className="bg-white/[0.05] hover:bg-white/[0.08] focus:bg-white/[0.09] border border-white/[0.12] focus:border-sky-400/50 rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-white/40 outline-none backdrop-blur-xl w-52 sm:w-60 transition"
                />
              </div>

              {/* Tertiary Circular Glass Refresh Button */}
              <button
                onClick={() => loadBackupData(false)}
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                title="Refresh Real-Time Telemetry"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
              </button>

              {/* Secondary Glass Pill 1: Sync UniFi NAS -> B2 */}
              <button
                onClick={() => handleSyncToB2('vault-unifi-unas-pro-01')}
                disabled={busyAction === 'sync:vault-unifi-unas-pro-01'}
                className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-50 text-white/90 border border-white/[0.14] text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xl transition cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
              >
                <Cloud className={`w-3.5 h-3.5 text-sky-300 ${busyAction === 'sync:vault-unifi-unas-pro-01' ? 'animate-bounce' : ''}`} />
                <span>Sync 3-2-1 B2</span>
              </button>

              {/* Secondary Glass Pill 2: Bare-Metal Recovery ISO */}
              <button
                onClick={() => setShowNewBmrModal(true)}
                className="px-3.5 py-2 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-400/25 text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xl transition cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              >
                <Disc className="w-3.5 h-3.5 text-amber-300" />
                <span>Bare-Metal ISO</span>
              </button>

              {/* Primary Action (1): Glowing Sapphire Blue Pill CTA */}
              <button
                onClick={() => setShowRunBackupModal(true)}
                className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-[0_8px_24px_rgba(37,99,235,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] border border-sky-300/30 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Run Backup</span>
              </button>
            </div>
          </div>

          {/* Toast Notification Pill */}
          {toast && (
            <div
              className={`mt-3.5 px-4 py-2.5 rounded-2xl border backdrop-blur-2xl text-xs font-medium flex items-center justify-between animate-fadeIn ${
                toast.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                  : toast.type === 'warn'
                  ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                  : 'bg-rose-500/15 border-rose-400/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{toast.text}</span>
              </div>
              <button onClick={() => setToast(null)} className="text-white/60 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Segmented Frosted Pill Navigation Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.09] backdrop-blur-xl">
              {[
                { id: 'backups-overview', label: 'Overview', icon: Activity },
                { id: 'backups-snapshots', label: 'Snapshots', icon: FolderOpen, count: snapshots.length },
                { id: 'backups-vaults', label: 'Storage Vaults', icon: Database, count: vaults.length },
                { id: 'backups-policies', label: 'Policies', icon: Layers, count: policies.length },
                { id: 'backups-bmr', label: 'Bare-Metal BMR', icon: Disc, count: bmrSessions.length },
                { id: 'backups-agents', label: 'Endpoints', icon: Cpu, count: endpointAgents.length }
              ].map(tab => {
                const Icon = tab.icon;
                const active = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSubTab(tab.id as BackupSubTab)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition cursor-pointer ${
                      active
                        ? 'bg-white/[0.15] text-white shadow-[0_2px_10px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          active ? 'bg-sky-400/25 text-sky-200' : 'bg-white/[0.07] text-white/55'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Subtle Architecture Status Pills */}
            <div className="hidden 2xl:flex items-center gap-2 text-[11px] text-white/60">
              <span className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] font-mono">
                Tier-1: UNAS Pro 10GbE NFS
              </span>
              <span className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] font-mono">
                Tier-2: Backblaze B2 ($6.95/TB)
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------- */}
        {/* MAIN SCROLLABLE WORKSPACE                                           */}
        {/* ------------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* ================================================================= */}
          {/* TAB 1: GLASSY DASHBOARD V18 OVERVIEW (2-COLUMN SPATIAL GRID)      */}
          {/* ================================================================= */}
          {currentTab === 'backups-overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* ------------------------------------------------------------- */}
              {/* LEFT / CENTER MAIN COLUMN (8 COLS)                            */}
              {/* ------------------------------------------------------------- */}
              <div className="xl:col-span-8 space-y-6">
                {/* 4 Glassy KPI Stat Cards (Matching Screenshot StatsCard) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* KPI 1: Protected Storage */}
                  <div className="glass-card p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-sky-300">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-mono text-white/45">CDC 4MB</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Logical Protected</p>
                    <h2 className="text-3xl font-bold tracking-tight text-white mt-1">
                      {formatBytes(overview?.kpis.logicalProtectedBytes ?? 0)}
                    </h2>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                        <TrendingUp className="w-3 h-3" />
                        +{overview?.kpis.dedupSavingsPct ?? 0}% ({overview?.kpis.dedupRatio ?? 1}x)
                      </span>
                    </div>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                        style={{ width: `${Math.min(95, Math.max(20, 100 - (overview?.kpis.dedupSavingsPct ?? 25)))}%` }}
                      />
                    </div>
                  </div>

                  {/* KPI 2: Live Files Synced */}
                  <div className="glass-card p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-emerald-300">
                        <RefreshCw className={`w-4 h-4 ${liveSync && !liveSync.completed ? 'animate-spin' : ''}`} />
                      </div>
                      <span className="text-[11px] font-mono text-emerald-300">
                        {liveSync ? `${liveSync.filesProgressPct}%` : '100%'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Files Synced (Live)</p>
                    <h2 className="text-3xl font-bold tracking-tight text-white mt-1">
                      {syncedFiles.toLocaleString()}
                    </h2>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-400/20">
                        {bytesMb} MB / {totalFiles.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500"
                        style={{ width: `${Math.max(6, filesPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* KPI 3: Immutable WORM Snapshots */}
                  <div className="glass-card p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-amber-300">
                        <Lock className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-mono text-amber-300/80">90d WORM</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">WORM Snapshots</p>
                    <h2 className="text-3xl font-bold tracking-tight text-white mt-1">
                      {overview?.kpis.immutableWormSnapshots ?? snapshots.length}
                    </h2>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                        {overview?.kpis.verifiedSnapshots ?? snapshots.length} SHA-256 Verified
                      </span>
                    </div>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" />
                    </div>
                  </div>

                  {/* KPI 4: Protected Endpoints */}
                  <div className="glass-card p-5 rounded-2xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-indigo-300">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-mono text-white/45">
                        {overview?.kpis.offsiteReplicationHealthPct ?? 100}% B2
                      </span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Protected Endpoints</p>
                    <h2 className="text-3xl font-bold tracking-tight text-white mt-1">
                      {overview?.kpis.protectedEndpointsCount ?? endpointAgents.length}
                      <span className="text-lg font-medium text-white/40">
                        /{overview?.kpis.totalManagedEndpointsCount ?? endpointAgents.length}
                      </span>
                    </h2>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-400/20">
                        VSS: {overview?.kpis.vssSnapshotEndpoints ?? 0} • BMR: {overview?.kpis.bareMetalEndpoints ?? 0}
                      </span>
                    </div>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400" />
                    </div>
                  </div>
                </div>

                {/* Main Center Frosted Glass Table Card (Matching Screenshot Leads Table) */}
                <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-5">
                  {/* Segmented Sub-Pill Bar + Right Action Link */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                      {[
                        { id: 'streams', label: 'Live Sync & Jobs' },
                        { id: 'snapshots', label: 'Verified Snapshots' },
                        { id: 'pipeline', label: '3-2-1 Pipeline Stages' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setOverviewTableMode(tab.id as any)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                            overviewTableMode === tab.id
                              ? 'bg-white/[0.15] text-white font-semibold shadow-xs'
                              : 'text-white/55 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setSubTab('backups-snapshots')}
                      className="text-xs font-medium text-white/70 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Open Time-Machine Browser</span>
                      <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                    </button>
                  </div>

                  {/* MODE A: LIVE SYNC & JOBS GLASS TABLE */}
                  {overviewTableMode === 'streams' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.08] text-[11px] font-medium text-white/45">
                            <th className="pb-3 pr-3 font-medium">Endpoint / Stream</th>
                            <th className="pb-3 px-3 font-medium">Vault / Source</th>
                            <th className="pb-3 px-3 font-medium">Progress &amp; Score</th>
                            <th className="pb-3 px-3 font-medium">Status</th>
                            <th className="pb-3 px-3 font-medium text-right">Volume / Speed</th>
                            <th className="pb-3 pl-3 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {jobs.map((job, idx) => {
                            const isLive = job.id === 'job-live-sync-gambinos' || job.status === 'running';
                            const initials = (job.deviceName || 'MV')
                              .replace(/^DESKTOP-/, '')
                              .slice(0, 2)
                              .toUpperCase();
                            const avatarGradients = [
                              'from-sky-400 to-blue-600',
                              'from-emerald-400 to-teal-600',
                              'from-amber-400 to-orange-600',
                              'from-indigo-400 to-purple-600'
                            ];
                            return (
                              <tr key={job.id} className="hover:bg-white/[0.035] transition group">
                                {/* Dominant Identity Column */}
                                <td className="py-3.5 pr-3">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${
                                        avatarGradients[idx % avatarGradients.length]
                                      } flex items-center justify-center text-[11px] font-bold text-white shadow-md shrink-0`}
                                    >
                                      {initials}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-white text-xs truncate">
                                        {job.deviceName || 'Multi-Tenant Vault Sync'}
                                      </div>
                                      <div className="text-[11px] text-white/50 truncate max-w-[260px]">
                                        {job.clientName} • <span className="font-mono text-white/40">{job.jobNumber}</span>
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Source / Mode Dot */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2 text-white/80">
                                    <span className={`w-2 h-2 rounded-full ${MODE_LABELS[job.mode]?.dot || 'bg-sky-400'}`} />
                                    <span>{MODE_LABELS[job.mode]?.short || 'CDC Stream'}</span>
                                  </div>
                                </td>

                                {/* Horizontal Glass Progress Bar + Numeric Score */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-24 h-1.5 rounded-full bg-white/[0.09] overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          isLive
                                            ? 'bg-gradient-to-r from-sky-400 to-emerald-400'
                                            : 'bg-gradient-to-r from-emerald-400 to-teal-400'
                                        }`}
                                        style={{ width: `${Math.max(8, job.progressPct)}%` }}
                                      />
                                    </div>
                                    <span className="font-mono font-semibold text-white text-xs">
                                      {job.progressPct}%
                                    </span>
                                  </div>
                                </td>

                                {/* Status Pill */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                      isLive
                                        ? 'bg-sky-500/15 text-sky-300 border-sky-400/30'
                                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        isLive ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'
                                      }`}
                                    />
                                    {isLive ? 'Streaming Live' : 'Verified'}
                                  </span>
                                </td>

                                {/* Right-Aligned Numbers */}
                                <td className="py-3.5 px-3 text-right whitespace-nowrap">
                                  <div className="font-mono font-semibold text-white">
                                    {formatBytes(job.deduplicatedBytesWritten)}
                                  </div>
                                  <div className="text-[10px] font-mono text-white/45">
                                    {job.transferRateMbps > 0 ? `${job.transferRateMbps} Mbps` : formatRelativeTime(job.completedAt)}
                                  </div>
                                </td>

                                {/* Right-Aligned Glass Action Pill */}
                                <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => setSubTab('backups-snapshots')}
                                    className="px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] text-[11px] font-medium text-white/85 hover:text-white transition cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* MODE B: VERIFIED SNAPSHOTS GLASS TABLE */}
                  {overviewTableMode === 'snapshots' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.08] text-[11px] font-medium text-white/45">
                            <th className="pb-3 pr-3 font-medium">Snapshot Host</th>
                            <th className="pb-3 px-3 font-medium">Mode</th>
                            <th className="pb-3 px-3 font-medium">Dedup Savings</th>
                            <th className="pb-3 px-3 font-medium">WORM Integrity</th>
                            <th className="pb-3 px-3 font-medium text-right">Logical → Stored</th>
                            <th className="pb-3 pl-3 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {snapshots.map(snap => (
                            <tr key={snap.id} className="hover:bg-white/[0.035] transition">
                              <td className="py-3.5 pr-3">
                                <div className="font-semibold text-white">{snap.deviceName}</div>
                                <div className="text-[11px] text-white/50 font-mono">
                                  {snap.clientName} • {snap.manifestId.slice(0, 10)}...
                                </div>
                              </td>
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-2 text-white/80">
                                  <span className={`w-2 h-2 rounded-full ${MODE_LABELS[snap.mode].dot}`} />
                                  <span>{MODE_LABELS[snap.mode].short}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 rounded-full bg-white/[0.09] overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                                      style={{ width: `${Math.max(15, snap.dedupSavingsPct)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-semibold text-emerald-300">
                                    {snap.dedupSavingsPct}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                                  SHA-256 + WORM
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono whitespace-nowrap">
                                <span className="text-white/70">{formatBytes(snap.logicalBytes)}</span>
                                <span className="text-white/35 mx-1">→</span>
                                <span className="text-emerald-300 font-semibold">{formatBytes(snap.storedDeduplicatedBytes)}</span>
                              </td>
                              <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setSelectedSnapshotId(snap.id);
                                    setSubTab('backups-snapshots');
                                  }}
                                  className="px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] text-[11px] font-medium text-white transition cursor-pointer"
                                >
                                  Restore
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* MODE C: 3-2-1 PIPELINE STAGES */}
                  {overviewTableMode === 'pipeline' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {[
                        {
                          stage: 'STAGE 1 • ENDPOINT SIDECAR',
                          title: 'Kopia CDC + Zstd + AES-256-GCM',
                          desc: 'Windows VSS / macOS APFS / Linux LVM atomic snapshot chunked into 4 MB Buzhash packs before leaving host.',
                          metric: `${overview?.kpis.dedupSavingsPct ?? 0}% Dedup Hit • 0 CLI Secrets`,
                          accent: 'text-sky-300 border-sky-400/25 bg-sky-500/10'
                        },
                        {
                          stage: 'STAGE 2 • APPEND-ONLY GATEWAY',
                          title: 'Proxmox Kopia Server (192.168.11.19:51515)',
                          desc: 'mTLS gRPC gateway with local NVMe index cache enforcing --append-only ACLs so ransomware cannot delete packs.',
                          metric: '0.4ms LAN • Append-Only Enforced',
                          accent: 'text-indigo-300 border-indigo-400/25 bg-indigo-500/10'
                        },
                        {
                          stage: 'STAGE 3 • TIER-1 LAN VAULT',
                          title: 'UniFi UNAS Pro (10GbE NFS v4.2)',
                          desc: 'Primary LAN vault on 192.168.4.161:/volume1/.srv/.unifi-drive/ApexVault-Backups/.data for instant restores.',
                          metric: `${formatBytes(vaults[0]?.storedDeduplicatedBytes ?? 0)} Stored on UNAS Pro`,
                          accent: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10'
                        },
                        {
                          stage: 'STAGE 4 • TIER-2 OFFSITE WORM',
                          title: 'Backblaze B2 Cloud (S3 Object Lock)',
                          desc: 'Encrypted offsite replication to s3.us-east-005.backblazeb2.com with 90-day COMPLIANCE Object Lock.',
                          metric: `${formatBytes(overview?.kpis.storedDeduplicatedBytes ?? 0)} Replicated • $6.95/TB`,
                          accent: 'text-amber-300 border-amber-400/25 bg-amber-500/10'
                        }
                      ].map(item => (
                        <div key={item.stage} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${item.accent}`}>
                            {item.stage}
                          </span>
                          <div className="font-semibold text-sm text-white">{item.title}</div>
                          <p className="text-xs text-white/55 leading-relaxed">{item.desc}</p>
                          <div className="pt-2 border-t border-white/[0.06] text-[11px] font-mono text-white/80">
                            {item.metric}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* RIGHT BENTO GLASS RAIL (4 COLS — MATCHING SCREENSHOT RIGHT)   */}
              {/* ------------------------------------------------------------- */}
              <div className="xl:col-span-4 space-y-5">
                {/* BENTO CARD 1: SAPPHIRE BLUE FROSTED CARD WITH VERTICAL BAR CHART */}
                <div className="glass-bento-blue rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-white/[0.16] border border-white/[0.25] flex items-center justify-center text-white">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white/90">Live Desktop File Sync</div>
                        <div className="text-[11px] text-sky-100/70">
                          {liveSync ? `${liveSync.sourceDeviceName} → ${liveSync.targetDeviceName}` : 'Real-Time Endpoint Stream'}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-white/[0.16] border border-white/[0.24] text-[11px] font-mono font-semibold text-white">
                      {liveSync ? `${liveSync.averageSpeedMbps} Mbps` : 'Active'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-white">
                        {bytesMb} MB
                      </div>
                      <div className="text-xs text-sky-100/80 mt-0.5 font-mono">
                        {liveSync
                          ? `${liveSync.filesSynced.toLocaleString()} / ${liveSync.filesDiscovered.toLocaleString()} files (${liveSync.bytesSynced.toLocaleString()} B)`
                          : `${syncedFiles.toLocaleString()} verified files protected`}
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/35 text-emerald-200 text-xs font-semibold">
                      +{filesPct}%
                    </span>
                  </div>

                  {/* Live Current File Stream Pill */}
                  {liveSync && (
                    <div className="px-3 py-2 rounded-2xl bg-black/25 border border-white/[0.14] flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                      <span className="font-mono text-white/90 truncate" title={liveSync.currentFile}>
                        {liveSync.currentFile}
                      </span>
                    </div>
                  )}

                  {/* 10-Bar Vertical Frosted Glass Bar Chart (Matching Screenshot Top-Right Card) */}
                  <div className="pt-3">
                    <div className="h-28 flex items-end justify-between gap-2 px-1">
                      {syncStageBars.map((bar, i) => (
                        <div key={bar.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <div className="w-full h-20 bg-white/[0.08] rounded-t-lg overflow-hidden flex items-end p-0.5">
                            <div
                              className={`w-full rounded-t-md transition-all duration-500 ${
                                i < 4
                                  ? 'bg-gradient-to-t from-sky-200/60 to-white'
                                  : 'bg-gradient-to-t from-sky-300/40 to-sky-100/90'
                              }`}
                              style={{ height: `${Math.max(18, Math.min(100, bar.pct))}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-white/70">{bar.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* BENTO CARD 2: WARM AMBER/GOLD GLASS CARD WITH CIRCULAR '+' BUTTON */}
                <div className="glass-bento-amber rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                      <Database className="w-3.5 h-3.5 text-amber-300" />
                      <span>Deduplicated Vault Storage</span>
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-white">
                      {formatBytes(overview?.kpis.storedDeduplicatedBytes ?? 0)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/25 text-amber-200 text-[11px] font-semibold">
                        ${overview?.kpis.estimatedMonthlyB2CostUsd ?? 0}/mo B2
                      </span>
                      <span className="text-[11px] text-white/50">
                        UNAS Pro + B2 WORM
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSyncToB2('vault-unifi-unas-pro-01')}
                    title="Trigger Immediate 3-2-1 Cloud Sync"
                    className="w-12 h-12 rounded-full bg-white/[0.10] hover:bg-white/[0.18] border border-white/[0.22] flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* BENTO CARD 3: DARK GLASS AREA SPARKLINE CARD (MATCHING SCREENSHOT BOTTOM-RIGHT) */}
                <div className="glass-card rounded-3xl p-5 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                      <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                      <span>CDC Deduplication Efficiency</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-[11px] font-semibold">
                      +{overview?.kpis.dedupSavingsPct ?? 0}% Saved
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2.5">
                    <div className="text-3xl font-bold tracking-tight text-white">
                      {overview?.kpis.dedupRatio ?? 1.39}x
                    </div>
                    <span className="text-xs text-white/50">
                      ({formatBytes(overview?.kpis.logicalProtectedBytes ?? 0)} → {formatBytes(overview?.kpis.storedDeduplicatedBytes ?? 0)})
                    </span>
                  </div>

                  {/* Smooth Glowing SVG Area Sparkline */}
                  <div className="pt-2">
                    <svg viewBox="0 0 320 90" className="w-full h-24 overflow-visible">
                      <defs>
                        <linearGradient id="v18AreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.42)" />
                          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.0)" />
                        </linearGradient>
                        <linearGradient id="v18LineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="50%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="22" x2="320" y2="22" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <line x1="0" y1="52" x2="320" y2="52" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <line x1="0" y1="82" x2="320" y2="82" stroke="rgba(255,255,255,0.06)" />
                      <path
                        d="M 0 72 C 45 68, 65 42, 110 46 C 155 50, 180 24, 225 28 C 265 31, 285 12, 320 10 L 320 85 L 0 85 Z"
                        fill="url(#v18AreaGrad)"
                      />
                      <path
                        d="M 0 72 C 45 68, 65 42, 110 46 C 155 50, 180 24, 225 28 C 265 31, 285 12, 320 10"
                        fill="none"
                        stroke="url(#v18LineGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx="320" cy="10" r="4" fill="#34d399" />
                    </svg>
                    <div className="flex justify-between text-[10px] font-mono text-white/45 pt-1">
                      <span>Phase 1 File CDC</span>
                      <span>Phase 2 VSS</span>
                      <span>Phase 3 Bare-Metal</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: SNAPSHOTS & TIME-MACHINE FILE BROWSER                      */}
          {/* ================================================================= */}
          {currentTab === 'backups-snapshots' && (
            <div className="space-y-5">
              {/* Frosted Glass Filter Bar */}
              <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={snapClientFilter}
                    onChange={e => setSnapClientFilter(e.target.value)}
                    className="bg-white/[0.06] border border-white/[0.12] rounded-full px-3.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all" className="bg-slate-900">All Client Tenants</option>
                    <option value="c-gambinos" className="bg-slate-900">Gambinos</option>
                    <option value="c-municipality" className="bg-slate-900">City of Auburn Utilities</option>
                    <option value="c-brandon-ray" className="bg-slate-900">Raytreat / DevStudio</option>
                    <option value="c-tbi" className="bg-slate-900">The Broken iPhone (TBI)</option>
                  </select>

                  <select
                    value={snapDeviceFilter}
                    onChange={e => setSnapDeviceFilter(e.target.value)}
                    className="bg-white/[0.06] border border-white/[0.12] rounded-full px-3.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all" className="bg-slate-900">All Protected Devices</option>
                    {endpointAgents.map(a => (
                      <option key={a.deviceId} value={a.deviceId} className="bg-slate-900">
                        {a.hostname}
                      </option>
                    ))}
                  </select>

                  <select
                    value={snapModeFilter}
                    onChange={e => setSnapModeFilter(e.target.value as BackupMode | 'all')}
                    className="bg-white/[0.06] border border-white/[0.12] rounded-full px-3.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all" className="bg-slate-900">All Backup Modes (Phase 1–3)</option>
                    <option value="file_object_dedup" className="bg-slate-900">Phase 1: File/Object Dedup</option>
                    <option value="volume_snapshot_vss" className="bg-slate-900">Phase 2: Atomic Volume Snapshot</option>
                    <option value="bare_metal_image" className="bg-slate-900">Phase 3: Bare-Metal Image</option>
                  </select>
                </div>

                <button
                  onClick={() => setShowRunBackupModal(true)}
                  className="px-4 py-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Create Snapshot</span>
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {/* Left 5 Cols: Snapshot Cards */}
                <div className="xl:col-span-5 space-y-3">
                  {filteredSnapshots.map(snap => {
                    const isSelected = activeSnapshot?.id === snap.id;
                    return (
                      <div
                        key={snap.id}
                        onClick={() => {
                          setSelectedSnapshotId(snap.id);
                          if (snap.filesPreview?.length > 0) {
                            setSelectedFilePaths([snap.filesPreview[0].path]);
                          }
                        }}
                        className={`p-4 rounded-2xl border transition cursor-pointer backdrop-blur-xl ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-400/45 shadow-[0_12px_32px_rgba(14,165,233,0.2)]'
                            : 'glass-card hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">{snap.deviceName}</span>
                              <span className="text-[11px] text-white/50">({snap.clientName})</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${MODE_LABELS[snap.mode].color}`}>
                                {MODE_LABELS[snap.mode].badge}
                              </span>
                              {snap.replicatedToB2 && (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25 text-[10px] font-semibold">
                                  3-2-1 B2 WORM
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-sky-300">
                              {formatBytes(snap.logicalBytes)}
                            </div>
                            <div className="text-[10px] text-white/50">
                              → {formatBytes(snap.storedDeduplicatedBytes)} ({snap.dedupSavingsPct}% saved)
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-white/55">
                          <span className="font-mono text-white/75">
                            Manifest: {snap.manifestId.slice(0, 12)}...
                          </span>
                          <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            SHA-256 Verified • {formatRelativeTime(snap.completedAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right 7 Cols: Snapshot Inspector */}
                <div className="xl:col-span-7">
                  {activeSnapshot ? (
                    <div className="glass-card rounded-3xl p-6 space-y-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h3 className="text-base font-bold text-white">
                              {activeSnapshot.deviceName}
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 font-mono text-[10px] font-semibold">
                              SHA-256 INTEGRITY VERIFIED
                            </span>
                          </div>
                          <p className="text-xs text-white/55 mt-0.5">
                            Policy: {activeSnapshot.policyName} • Vault: {activeSnapshot.vaultName}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVerifySnapshot(activeSnapshot.id)}
                            disabled={busyAction === `verify:${activeSnapshot.id}`}
                            className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.14] text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Scrub SHA-256</span>
                          </button>

                          <button
                            onClick={() => {
                              setNewBmrSnapshotId(activeSnapshot.id);
                              setShowNewBmrModal(true);
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Disc className="w-3.5 h-3.5" />
                            <span>Boot BMR / P2V</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-3.5">
                          <div className="text-[10px] font-semibold uppercase text-white/45">
                            SHA-256 Root Manifest Hash
                          </div>
                          <div className="font-mono text-[11px] text-emerald-300 break-all mt-1">
                            {activeSnapshot.sha256RootHash}
                          </div>
                        </div>

                        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-3.5">
                          <div className="text-[10px] font-semibold uppercase text-white/45">
                            Atomic Snapshot Source (VSS / APFS / LVM)
                          </div>
                          <div className="font-mono text-[11px] text-sky-300 break-all mt-1">
                            {activeSnapshot.vssShadowCopyPath || '\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy14'}
                          </div>
                        </div>
                      </div>

                      {/* Files Table */}
                      <div className="border border-white/[0.08] rounded-2xl overflow-hidden bg-black/20">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-white/[0.04] border-b border-white/[0.08] text-[10px] text-white/50 uppercase">
                              <th className="py-2.5 px-3 w-8">Sel</th>
                              <th className="py-2.5 px-3">Path / Block Object</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3 text-right">Size</th>
                              <th className="py-2.5 px-3 text-right">CDC Chunks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {activeSnapshot.filesPreview.map(entry => {
                              const checked = selectedFilePaths.includes(entry.path);
                              return (
                                <tr
                                  key={entry.path}
                                  onClick={() => toggleFileSelection(entry.path)}
                                  className={`cursor-pointer transition ${
                                    checked ? 'bg-sky-500/15 text-white' : 'hover:bg-white/[0.04] text-white/80'
                                  }`}
                                >
                                  <td className="py-2.5 px-3">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {}}
                                      className="accent-sky-500 rounded cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-sky-200 break-all">
                                    {entry.path}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.07] text-white/75 font-mono text-[10px]">
                                      {entry.type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-right whitespace-nowrap">
                                    {formatBytes(entry.sizeBytes)}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-right text-white/55">
                                    {entry.chunksCount || 1}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Granular Restore Bar */}
                      <div className="bg-white/[0.04] border border-white/[0.1] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <label className="text-[11px] font-semibold text-sky-300 block">
                            Granular Restore Target Path
                          </label>
                          <input
                            type="text"
                            value={restoreTargetPath}
                            onChange={e => setRestoreTargetPath(e.target.value)}
                            className="w-full bg-black/30 border border-white/[0.12] rounded-xl px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-sky-400"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setRestoreTargetPath('ORIGINAL_IN_PLACE_PATH')}
                            className="px-3 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/80 text-xs font-medium cursor-pointer"
                          >
                            Original Path
                          </button>
                          <button
                            onClick={() => handleRestoreSnapshot(activeSnapshot.id)}
                            disabled={busyAction === `restore:${activeSnapshot.id}`}
                            className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore ({selectedFilePaths.length || 'All'})</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-card rounded-3xl p-8 text-center text-white/50">
                      No snapshots match the current filter.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: STORAGE VAULTS (UNIFI NAS & BACKBLAZE B2 API)              */}
          {/* ================================================================= */}
          {currentTab === 'backups-vaults' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    3-2-1 Storage Vaults (UniFi UNAS Pro LAN &amp; Backblaze B2 WORM Cloud)
                  </h2>
                  <p className="text-xs text-white/55">
                    Primary 10GbE NFS repository paired with Backblaze B2 S3 Object Lock COMPLIANCE storage
                  </p>
                </div>
                <button
                  onClick={() => setShowAddVaultModal(true)}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Storage Vault</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {vaults.map(vault => {
                  const isUnifi = vault.backendType === 'unifi_nas_kopia';
                  return (
                    <div
                      key={vault.id}
                      className={`rounded-3xl p-6 space-y-4 ${
                        isUnifi ? 'glass-bento-blue' : 'glass-bento-amber'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-white/[0.14] border border-white/[0.22] flex items-center justify-center text-white">
                            {isUnifi ? <Server className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white">{vault.name}</h3>
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-300/30 text-emerald-200 text-[10px] font-semibold">
                                ONLINE
                              </span>
                            </div>
                            <p className="text-xs text-white/70 mt-0.5">{vault.description}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-black/25 border border-white/[0.12] rounded-2xl p-3">
                          <div className="text-[10px] text-white/55 uppercase">Endpoint</div>
                          <div className="font-mono text-[11px] text-white truncate mt-0.5" title={vault.endpointUrl}>
                            {vault.endpointUrl}
                          </div>
                        </div>
                        <div className="bg-black/25 border border-white/[0.12] rounded-2xl p-3">
                          <div className="text-[10px] text-white/55 uppercase">Immutability</div>
                          <div className="font-mono text-[11px] text-amber-200 mt-0.5">
                            {vault.immutableLockMode || 'COMPLIANCE'} ({vault.immutableRetentionDays}d)
                          </div>
                        </div>
                        <div className="bg-black/25 border border-white/[0.12] rounded-2xl p-3">
                          <div className="text-[10px] text-white/55 uppercase">Logical → Stored</div>
                          <div className="font-mono text-[11px] text-emerald-200 mt-0.5">
                            {formatBytes(vault.logicalProtectedBytes)} → {formatBytes(vault.storedDeduplicatedBytes)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-Tenant Append-Only B2 Key Provisioner & Cost Calculator */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 glass-card rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-300" />
                        <span>Per-Tenant Append-Only Backblaze B2 Keys (b2_create_key)</span>
                      </h3>
                      <p className="text-xs text-white/55 mt-0.5">
                        deleteFiles &amp; deleteBucket capabilities are omitted so compromised endpoints cannot erase backups
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={b2KeyTenantId}
                      onChange={e => setB2KeyTenantId(e.target.value)}
                      className="bg-white/[0.06] border border-white/[0.12] rounded-full px-3.5 py-2 text-xs text-white outline-none"
                    >
                      <option value="c-gambinos" className="bg-slate-900">Gambinos</option>
                      <option value="c-municipality" className="bg-slate-900">City of Auburn Utilities</option>
                      <option value="c-tbi" className="bg-slate-900">The Broken iPhone (TBI)</option>
                      <option value="c-brandon-ray" className="bg-slate-900">Raytreat / DevStudio</option>
                    </select>
                    <input
                      type="text"
                      value={b2KeyBucketName}
                      onChange={e => setB2KeyBucketName(e.target.value)}
                      className="bg-white/[0.06] border border-white/[0.12] rounded-full px-3.5 py-2 text-xs font-mono text-white outline-none"
                    />
                    <button
                      onClick={handleMintB2Key}
                      className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Mint Append-Only Key
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-[10px] text-white/45 uppercase">
                          <th className="py-2 px-3">Tenant</th>
                          <th className="py-2 px-3">Key ID</th>
                          <th className="py-2 px-3">Prefix</th>
                          <th className="py-2 px-3">Ransomware Guard</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {b2Keys.map(k => (
                          <tr key={k.keyId}>
                            <td className="py-2.5 px-3 font-semibold text-white">{k.clientName}</td>
                            <td className="py-2.5 px-3 font-mono text-amber-300 text-[11px]">{k.keyId}</td>
                            <td className="py-2.5 px-3 font-mono text-sky-300 text-[11px]">{k.namePrefix}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 font-mono text-[10px] font-semibold">
                                deleteFiles BLOCKED
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="xl:col-span-5 glass-card rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white">
                    Cloud Economics Calculator ($6.95/TB Backblaze B2)
                  </h3>
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/70">Deduplicated Physical Storage:</span>
                      <span className="font-mono font-bold text-sky-300">{b2CalcTb} TB</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={b2CalcTb}
                      onChange={e => setB2CalcTb(Number(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white">Backblaze B2 ($6.95/TB)</div>
                        <div className="text-[11px] text-white/60">No 90-day deletion penalty • S3 Object Lock</div>
                      </div>
                      <div className="font-mono font-bold text-base text-emerald-300">
                        ${(b2CalcTb * 6.95).toFixed(2)}/mo
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white/85">Cloudflare R2 ($15/TB)</div>
                        <div className="text-[11px] text-white/50">2.15x higher monthly storage rate</div>
                      </div>
                      <div className="font-mono font-semibold text-sm text-rose-300">
                        ${(b2CalcTb * 15).toFixed(2)}/mo
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: POLICIES & PHASE 1-3 SCHEDULES                             */}
          {/* ================================================================= */}
          {currentTab === 'backups-policies' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Multi-Tenant Backup Policies &amp; Phase 1–3 Schedules
                  </h2>
                  <p className="text-xs text-white/55">
                    Configure File/Object Dedup, Atomic VSS/APFS/LVM Volume Snapshots, and Bare-Metal + UEFI Images
                  </p>
                </div>
                <button
                  onClick={() => setShowNewPolicyModal(true)}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Backup Policy</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {policies.map(pol => (
                  <div key={pol.id} className="glass-card rounded-3xl p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold text-base text-white">{pol.name}</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.07] text-white/80 text-[11px] font-medium">
                            Tenant: {pol.clientName}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${MODE_LABELS[pol.mode].color}`}>
                            {MODE_LABELS[pol.mode].badge}
                          </span>
                        </div>
                        <div className="text-xs text-white/55 mt-1 font-mono">
                          Cron: <span className="text-sky-300">{pol.scheduleCron}</span> ({pol.scheduleLabel}) • WORM Lock:{' '}
                          <span className="text-amber-300">{pol.immutableLockDays} Days COMPLIANCE</span>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pol.enabled}
                          onChange={e => handleTogglePolicy(pol, 'enabled', e.target.checked)}
                          className="accent-sky-400 w-4 h-4 cursor-pointer"
                        />
                        <span className={pol.enabled ? 'text-emerald-300' : 'text-white/40'}>
                          {pol.enabled ? 'Policy Active' : 'Paused'}
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-white/[0.08] text-xs">
                      {[
                        { field: 'enableWindowsVss', label: 'Windows VSS', val: pol.enableWindowsVss },
                        { field: 'enableApfsSnapshot', label: 'macOS APFS', val: pol.enableApfsSnapshot },
                        { field: 'enableLvmSnapshot', label: 'Linux LVM', val: pol.enableLvmSnapshot },
                        { field: 'capturePartitionTable', label: 'GPT/MBR Table', val: pol.capturePartitionTable },
                        { field: 'captureEfiBootloader', label: 'UEFI / BCD', val: pol.captureEfiBootloader }
                      ].map(item => (
                        <button
                          key={item.field}
                          onClick={() => handleTogglePolicy(pol, item.field as keyof BackupPolicy, !item.val)}
                          className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                            item.val
                              ? 'bg-sky-500/15 border-sky-400/35 text-sky-200'
                              : 'bg-white/[0.03] border-white/[0.08] text-white/45'
                          }`}
                        >
                          <div className="text-[10px] uppercase font-semibold">{item.label}</div>
                          <div className="font-mono font-bold mt-0.5">{item.val ? 'ENABLED' : 'Disabled'}</div>
                        </button>
                      ))}
                      <div className="p-3 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                        <div className="text-[10px] uppercase font-semibold text-white/45">GFS Retention</div>
                        <div className="font-mono text-[11px] text-amber-300 mt-0.5">
                          {pol.retention.daily}D • {pol.retention.weekly}W • {pol.retention.monthly}M
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: BARE-METAL RECOVERY (BMR) & PROXMOX P2V CENTER             */}
          {/* ================================================================= */}
          {currentTab === 'backups-bmr' && (
            <div className="space-y-5">
              <div className="glass-bento-amber rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Disc className="w-5 h-5 text-amber-300" />
                    <h2 className="text-base font-bold text-white">
                      Phase 3: Bare-Metal Recovery (BMR) &amp; Proxmox VE Instant P2V Center
                    </h2>
                  </div>
                  <p className="text-xs text-white/70 mt-1">
                    Boot any replacement workstation or Proxmox VM from the ApexMSP Live Recovery ISO, enter the 6-digit pairing code, and stream deduplicated blocks + UEFI + VirtIO drivers over 10GbE LAN.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewBmrModal(true)}
                  className="px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-xs flex items-center gap-2 shrink-0 shadow-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Launch BMR Session</span>
                </button>
              </div>

              {bmrSessions.length === 0 ? (
                <div className="glass-card rounded-3xl p-8 text-center space-y-3">
                  <Disc className="w-8 h-8 text-amber-300 mx-auto opacity-80" />
                  <div className="text-sm font-bold text-white">No Active Bare-Metal Recovery Sessions</div>
                  <p className="text-xs text-white/55 max-w-md mx-auto">
                    Click &ldquo;Launch BMR Session&rdquo; above to generate a live 6-digit WinPE / Linux ISO pairing code from any captured snapshot.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bmrSessions.map(sess => {
                    const currentStageIndex = BMR_STAGE_PIPELINE.findIndex(st => st.key === sess.status);
                    const bootCmd = `openmsp-agent --recovery-code ${sess.pairingCode} --server https://api.apexmsp.app`;
                    return (
                      <div key={sess.id} className="glass-card rounded-3xl p-6 space-y-4">
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-xs text-amber-200">
                                CODE: {sess.pairingCode}
                              </span>
                              <span className="font-bold text-base text-white">
                                {sess.sourceDeviceName} ({sess.clientName})
                              </span>
                            </div>
                            <div className="text-xs text-white/50 font-mono">
                              Snapshot: {sess.snapshotId} • Bootloader: {sess.bootloaderType.toUpperCase()}
                            </div>
                          </div>

                          {sess.status !== 'completed' ? (
                            <button
                              onClick={() => handleAdvanceBmrSession(sess.id)}
                              disabled={busyAction === `adv-bmr:${sess.id}`}
                              className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Advance Step ({sess.progressPct}%)</span>
                            </button>
                          ) : (
                            <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 font-semibold text-xs flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Completed (100%)</span>
                            </span>
                          )}
                        </div>

                        <div className="bg-black/30 border border-white/[0.1] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                          <code className="text-xs font-mono text-sky-300 break-all">{bootCmd}</code>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(bootCmd);
                              showToastMsg('success', `Copied recovery command for code ${sess.pairingCode}`);
                            }}
                            className="px-3 py-1 rounded-full bg-white/[0.08] text-white text-xs flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                          {BMR_STAGE_PIPELINE.map((stage, idx) => {
                            const isDone = idx < currentStageIndex || sess.status === 'completed';
                            const isCurrent = idx === currentStageIndex && sess.status !== 'completed';
                            return (
                              <div
                                key={stage.key}
                                className={`p-3 rounded-2xl border ${
                                  isDone
                                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                                    : isCurrent
                                    ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                                    : 'bg-white/[0.03] border-white/[0.08] text-white/40'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                                  <span>STEP {idx + 1}</span>
                                  {isDone ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : isCurrent ? (
                                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                  ) : (
                                    <Clock className="w-3.5 h-3.5 text-white/30" />
                                  )}
                                </div>
                                <div className="font-semibold text-xs text-white">{stage.label}</div>
                                <div className="text-[10px] opacity-75 mt-0.5">{stage.sub}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 6: ENDPOINT SIDECAR TELEMETRY (KOPIA AGENTS)                  */}
          {/* ================================================================= */}
          {currentTab === 'backups-agents' && (
            <div className="glass-card rounded-3xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  Managed Endpoint Sidecar Telemetry (<code className="text-sky-300">kopia</code> Binary Agents)
                </h2>
                <p className="text-xs text-white/55">
                  Go agent verifies sidecar SHA-256 hash before execution and passes credentials exclusively via ephemeral OS environment variables
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[11px] text-white/45">
                      <th className="py-3 px-3 font-medium">Endpoint &amp; Tenant</th>
                      <th className="py-3 px-3 font-medium">OS</th>
                      <th className="py-3 px-3 font-medium">Kopia Sidecar</th>
                      <th className="py-3 px-3 font-medium">Atomic Volume Engine</th>
                      <th className="py-3 px-3 font-medium text-right">Logical → Dedup</th>
                      <th className="py-3 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {endpointAgents.map(agent => (
                      <tr key={agent.deviceId} className="hover:bg-white/[0.035] transition">
                        <td className="py-3.5 px-3">
                          <div className="font-semibold text-white">{agent.hostname}</div>
                          <div className="text-[11px] text-white/50">
                            {agent.clientName} • <span className="font-mono">{agent.ipAddress}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.07] text-white/85 font-mono text-[10px] uppercase">
                            {agent.os}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5 font-mono text-emerald-300 font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{agent.report.kopiaVersion}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          {agent.report.vssAvailable && (
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-400/25 text-[10px] font-semibold">
                              Windows VSS Ready
                            </span>
                          )}
                          {agent.report.apfsSnapshotAvailable && (
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-400/25 text-[10px] font-semibold">
                              macOS APFS Ready
                            </span>
                          )}
                          {agent.report.lvmSnapshotAvailable && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25 text-[10px] font-semibold">
                              Linux LVM Ready
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-right whitespace-nowrap">
                          <span className="text-white/75">{formatBytes(agent.report.logicalBytesTotal)}</span>
                          <span className="text-white/35 mx-1">→</span>
                          <span className="text-emerald-300 font-semibold">{formatBytes(agent.report.deduplicatedBytesTotal)}</span>
                        </td>
                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleTriggerBackup(agent.deviceId, 'file_object_dedup')}
                              className="px-2.5 py-1 rounded-full bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-[11px] font-medium cursor-pointer"
                            >
                              File Dedup
                            </button>
                            <button
                              onClick={() => handleTriggerBackup(agent.deviceId, 'bare_metal_image')}
                              className="px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 text-[11px] font-medium cursor-pointer"
                            >
                              Bare-Metal
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: RUN BACKUP NOW                                               */}
      {/* ===================================================================== */}
      {showRunBackupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-v18-shell rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-sky-400" />
                <span>Run On-Demand Backup Snapshot</span>
              </h3>
              <button onClick={() => setShowRunBackupModal(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-white/75 block mb-1">Target Managed Endpoint</label>
                <select
                  value={runBackupDeviceId}
                  onChange={e => setRunBackupDeviceId(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                >
                  {endpointAgents.map(a => (
                    <option key={a.deviceId} value={a.deviceId} className="bg-slate-900">
                      {a.hostname} ({a.clientName} • {a.os.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Backup Mode (Phase 1–3)</label>
                <select
                  value={runBackupMode}
                  onChange={e => setRunBackupMode(e.target.value as BackupMode)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                >
                  <option value="file_object_dedup" className="bg-slate-900">Phase 1: File/Object Dedup (Buzhash 4M CDC + Zstd)</option>
                  <option value="volume_snapshot_vss" className="bg-slate-900">Phase 2: Atomic Volume Snapshot (VSS / APFS / LVM)</option>
                  <option value="bare_metal_image" className="bg-slate-900">Phase 3: Full Bare-Metal Image (VHDX/Raw + UEFI)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Include Paths / Volumes</label>
                <input
                  type="text"
                  value={runBackupIncludePath}
                  onChange={e => setRunBackupIncludePath(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                onClick={() => setShowRunBackupModal(false)}
                className="px-4 py-2 rounded-full bg-white/[0.06] text-white/80 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleTriggerBackup(
                    runBackupDeviceId,
                    runBackupMode,
                    runBackupIncludePath.split(',').map(s => s.trim()).filter(Boolean)
                  )
                }
                className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Dispatch Backup</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: NEW BARE-METAL RECOVERY ISO SESSION                          */}
      {/* ===================================================================== */}
      {showNewBmrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBmrSession}
            className="glass-v18-shell rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Disc className="w-4 h-4 text-amber-300" />
                <span>New Bare-Metal Recovery (BMR) / Proxmox P2V Session</span>
              </h3>
              <button type="button" onClick={() => setShowNewBmrModal(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-white/75 block mb-1">Source Snapshot to Restore</label>
                <select
                  value={newBmrSnapshotId}
                  onChange={e => setNewBmrSnapshotId(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                >
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id} className="bg-slate-900">
                      {s.deviceName} ({s.clientName}) — {MODE_LABELS[s.mode].short} • {formatBytes(s.logicalBytes)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Target Hardware / Hypervisor Profile</label>
                <select
                  value={newBmrProfile}
                  onChange={e => setNewBmrProfile(e.target.value as BareMetalRecoverySession['targetHardwareProfile'])}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                >
                  <option value="proxmox_vm_p2v" className="bg-slate-900">Proxmox VE P2V Instant VM Restore (10GbE LAN Stream)</option>
                  <option value="dissimilar_hardware_virtio" className="bg-slate-900">Dissimilar Hardware + VirtIO SCSI/Net Driver Injection</option>
                  <option value="same_hardware" className="bg-slate-900">Same Hardware Replacement</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-white/75 block mb-1">Bootloader Mode</label>
                  <select
                    value={newBmrBootloader}
                    onChange={e => setNewBmrBootloader(e.target.value as 'uefi_gpt' | 'bios_mbr')}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="uefi_gpt" className="bg-slate-900">UEFI + GPT</option>
                    <option value="bios_mbr" className="bg-slate-900">Legacy BIOS + MBR</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newBmrVirtio}
                      onChange={e => setNewBmrVirtio(e.target.checked)}
                      className="accent-amber-400 w-4 h-4"
                    />
                    <span className="font-semibold text-amber-200">Inject VirtIO Drivers</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowNewBmrModal(false)}
                className="px-4 py-2 rounded-full bg-white/[0.06] text-white/80 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Generate 6-Digit Pairing Code</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: ADD STORAGE VAULT                                            */}
      {/* ===================================================================== */}
      {showAddVaultModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateVault}
            className="glass-v18-shell rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white">
                Add New Storage Vault (UniFi NAS / Backblaze B2 / S3)
              </h3>
              <button type="button" onClick={() => setShowAddVaultModal(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-white/75 block mb-1">Vault Display Name</label>
                <input
                  type="text"
                  value={newVaultName}
                  onChange={e => setNewVaultName(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Storage Backend Architecture</label>
                <select
                  value={newVaultBackend}
                  onChange={e => setNewVaultBackend(e.target.value as BackupStorageBackendType)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                >
                  <option value="unifi_nas_kopia" className="bg-slate-900">UniFi NAS (10GbE NFS → Proxmox Kopia Gateway)</option>
                  <option value="backblaze_b2" className="bg-slate-900">Backblaze B2 Cloud ($6.95/TB • S3 Object Lock)</option>
                  <option value="s3_compatible" className="bg-slate-900">S3-Compatible Object Storage</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Gateway or S3 Endpoint URL</label>
                <input
                  type="text"
                  value={newVaultEndpoint}
                  onChange={e => setNewVaultEndpoint(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-white/75 block mb-1">NFS Export or Bucket Name</label>
                  <input
                    type="text"
                    value={newVaultNfsOrBucket}
                    onChange={e => setNewVaultNfsOrBucket(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-white/75 block mb-1">WORM Object Lock Days</label>
                  <input
                    type="number"
                    value={newVaultRetentionDays}
                    onChange={e => setNewVaultRetentionDays(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowAddVaultModal(false)}
                className="px-4 py-2 rounded-full bg-white/[0.06] text-white/80 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Save Storage Vault
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: CREATE BACKUP POLICY                                         */}
      {/* ===================================================================== */}
      {showNewPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePolicy}
            className="glass-v18-shell rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white">
                Create Multi-Tenant Backup Policy (Phase 1–3)
              </h3>
              <button type="button" onClick={() => setShowNewPolicyModal(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-white/75 block mb-1">Policy Name</label>
                <input
                  type="text"
                  value={newPolicyName}
                  onChange={e => setNewPolicyName(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-white/75 block mb-1">Client Tenant</label>
                  <select
                    value={newPolicyClientId}
                    onChange={e => setNewPolicyClientId(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="c-gambinos" className="bg-slate-900">Gambinos</option>
                    <option value="c-municipality" className="bg-slate-900">City of Auburn Utilities</option>
                    <option value="c-brandon-ray" className="bg-slate-900">Raytreat / DevStudio</option>
                    <option value="c-tbi" className="bg-slate-900">The Broken iPhone (TBI)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-white/75 block mb-1">Backup Mode</label>
                  <select
                    value={newPolicyMode}
                    onChange={e => setNewPolicyMode(e.target.value as BackupMode)}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 text-white outline-none"
                  >
                    <option value="file_object_dedup" className="bg-slate-900">Phase 1: File/Object Dedup</option>
                    <option value="volume_snapshot_vss" className="bg-slate-900">Phase 2: Atomic Volume Snapshot</option>
                    <option value="bare_metal_image" className="bg-slate-900">Phase 3: Bare-Metal Image</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-white/75 block mb-1">Cron Schedule</label>
                  <input
                    type="text"
                    value={newPolicyCron}
                    onChange={e => setNewPolicyCron(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-2.5 py-1.5 font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-white/75 block mb-1">Schedule Label</label>
                  <input
                    type="text"
                    value={newPolicyScheduleLabel}
                    onChange={e => setNewPolicyScheduleLabel(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-2.5 py-1.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-white/75 block mb-1">WORM Days</label>
                  <input
                    type="number"
                    value={newPolicyLockDays}
                    onChange={e => setNewPolicyLockDays(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-2.5 py-1.5 font-mono text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-white/75 block mb-1">Include Paths (comma-separated)</label>
                <input
                  type="text"
                  value={newPolicyPaths}
                  onChange={e => setNewPolicyPaths(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyVss} onChange={e => setNewPolicyVss(e.target.checked)} className="accent-sky-400" />
                  <span>Windows VSS Shadow Copy</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyApfs} onChange={e => setNewPolicyApfs(e.target.checked)} className="accent-sky-400" />
                  <span>macOS APFS tmutil Snapshot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyLvm} onChange={e => setNewPolicyLvm(e.target.checked)} className="accent-sky-400" />
                  <span>Linux LVM Snapshot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyPartition} onChange={e => setNewPolicyPartition(e.target.checked)} className="accent-sky-400" />
                  <span>Capture GPT/MBR + UEFI Boot</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowNewPolicyModal(false)}
                className="px-4 py-2 rounded-full bg-white/[0.06] text-white/80 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Save Backup Policy
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default BackupDashboardView;
