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
  AlertTriangle,
  Clock,
  Server,
  Terminal,
  FileText,
  FolderOpen,
  Layers,
  Cpu,
  KeyRound,
  Plus,
  Check,
  X,
  ArrowRight,
  Zap,
  Search,
  Copy,
  Disc,
  RotateCcw,
  Activity
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

const MODE_LABELS: Record<BackupMode, { badge: string; short: string; color: string }> = {
  file_object_dedup: {
    badge: 'Phase 1: File/Object Dedup',
    short: 'Phase 1 • File Dedup',
    color: 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  },
  volume_snapshot_vss: {
    badge: 'Phase 2: Atomic Volume Snapshot (VSS/APFS/LVM)',
    short: 'Phase 2 • Atomic VSS/APFS',
    color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
  },
  bare_metal_image: {
    badge: 'Phase 3: Bare-Metal Image (VHDX/Raw + EFI)',
    short: 'Phase 3 • Bare-Metal + EFI',
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
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

  const loadBackupData = useCallback(async () => {
    setLoading(true);
    try {
      const clientFilter = selectedClientId === 'all' ? undefined : selectedClientId;
      const res = await api.getBackupOverview(clientFilter);
      setOverview(res);
      if (res.snapshots.length > 0 && !res.snapshots.some(s => s.id === selectedSnapshotId)) {
        setSelectedSnapshotId(res.snapshots[0].id);
      }
    } catch (err: any) {
      showToastMsg('error', `Failed to load backup overview: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, selectedSnapshotId]);

  useEffect(() => {
    loadBackupData();
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

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#0b0f17] text-slate-100 overflow-hidden select-text">
      {/* ===================================================================== */}
      {/* TOP HEADER BAR WITH LIVE ENGINE & 3-2-1 STORAGE TIER BADGES           */}
      {/* ===================================================================== */}
      <div className="bg-[#0f1623] border-b border-slate-800 px-5 py-3.5 shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Left: Title & Live Status Badges */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50">
                <HardDrive className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-white">
                    ApexVault 3-2-1 Backup, Deduplication &amp; Bare-Metal Recovery
                  </h1>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Immutable WORM Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Phase 1–3 Unified Client-Side CDC Deduplication • Atomic VSS/APFS/LVM Snapshots • WinPE/Linux Live ISO &amp; Proxmox P2V Recovery
                </p>
              </div>
            </div>

            {/* Required Live Architecture Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-emerald-500/30 text-emerald-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-slate-400">Engine:</span>
                <strong className="font-mono text-emerald-200">
                  Kopia Sidecar v0.18.2 (SHA-256 Verified • Zero-CLI-Secret Env)
                </strong>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-indigo-500/30 text-indigo-300 font-medium">
                <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-slate-400">Tier-1 Primary Storage:</span>
                <strong className="font-mono text-indigo-200">
                  UniFi UNAS Pro (10GbE NFS -&gt; Proxmox Append-Only Gateway)
                </strong>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-amber-500/30 text-amber-300 font-medium">
                <Cloud className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-slate-400">Tier-2 Offsite Cloud:</span>
                <strong className="font-mono text-amber-200">
                  Backblaze B2 ($6.95/TB • S3 Object Lock COMPLIANCE)
                </strong>
              </div>
            </div>
          </div>

          {/* Right: Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowRunBackupModal(true)}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Backup Now</span>
            </button>

            <button
              onClick={() => handleSyncToB2('vault-unifi-unas-pro-01')}
              disabled={busyAction === 'sync:vault-unifi-unas-pro-01'}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-950/50 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'sync:vault-unifi-unas-pro-01' ? 'animate-spin' : ''}`} />
              <span>Sync UniFi NAS → Backblaze B2</span>
            </button>

            <button
              onClick={() => setShowNewBmrModal(true)}
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-950/50 transition cursor-pointer"
            >
              <Disc className="w-3.5 h-3.5" />
              <span>New Bare-Metal Recovery ISO Session</span>
            </button>

            <button
              onClick={() => loadBackupData()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              title="Refresh Backup Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Toast Banner */}
        {toast && (
          <div
            className={`mt-3 px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between ${
              toast.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                : toast.type === 'warn'
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-200'
                : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toast.text}</span>
            </div>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 6 Interactive Navigation Tabs */}
        <div className="flex items-center gap-1.5 mt-3.5 overflow-x-auto custom-scrollbar pb-0.5">
          {[
            { id: 'backups-overview', label: '1. Overview & 3-2-1 Pipeline', icon: Activity },
            { id: 'backups-snapshots', label: '2. Snapshots & Time-Machine Browser', icon: FolderOpen, count: snapshots.length },
            { id: 'backups-vaults', label: '3. Storage Vaults (UniFi NAS & B2 API)', icon: Database, count: vaults.length },
            { id: 'backups-policies', label: '4. Policies & Phase 1–3 Schedules', icon: Layers, count: policies.length },
            { id: 'backups-bmr', label: '5. Bare-Metal Recovery (BMR) & P2V', icon: Disc, count: bmrSessions.length },
            { id: 'backups-agents', label: '6. Endpoint Sidecar Telemetry (kopia)', icon: Cpu, count: endpointAgents.length }
          ].map(tab => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as BackupSubTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition shrink-0 cursor-pointer border ${
                  active
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      active ? 'bg-emerald-500/30 text-emerald-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MAIN SCROLLABLE CONTENT AREA                                          */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
        {/* ----------------------------------------------------------------- */}
        {/* TAB 1: OVERVIEW & 3-2-1 PIPELINE                                  */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-overview' && (
          <>
            {/* Top 4 KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Card 1: Logical vs Deduplicated Physical */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-semibold uppercase tracking-wider">Logical vs. Deduplicated Storage</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-bold text-[11px]">
                    {overview?.kpis.dedupRatio || 4.1}x Dedup
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-white">
                    {formatBytes(overview?.kpis.logicalProtectedBytes || 18.45 * 1024 ** 4)}
                  </span>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  <span className="text-xl font-black text-emerald-400">
                    {formatBytes(overview?.kpis.storedDeduplicatedBytes || 4.5 * 1024 ** 4)}
                  </span>
                </div>
                <div className="mt-2.5 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                    style={{ width: `${Math.min(95, 100 - (overview?.kpis.dedupSavingsPct || 75.6))}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Buzhash 4M CDC + Zstd + AES-256-GCM</span>
                  <strong className="text-emerald-300">{overview?.kpis.dedupSavingsPct || 75.6}% Space Saved</strong>
                </div>
              </div>

              {/* Card 2: Immutable WORM Snapshots */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-semibold uppercase tracking-wider">Immutable WORM Snapshots</span>
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-white">
                    {overview?.kpis.immutableWormSnapshots ?? snapshots.length}
                  </span>
                  <span className="text-xs text-emerald-400 font-semibold">
                    / {overview?.kpis.verifiedSnapshots ?? snapshots.length} SHA-256 Scrubbed
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-300">
                  S3 Object Lock <code className="text-amber-300 font-mono">COMPLIANCE</code> (90-Day Ransomware Lock)
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  Append-Only Agent Keys (<code className="text-rose-400">deleteFiles</code> blocked)
                </div>
              </div>

              {/* Card 3: Protected Endpoints (Phase 1-3) */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-semibold uppercase tracking-wider">Protected Endpoints (Phase 1–3)</span>
                  <Cpu className="w-4 h-4 text-sky-400" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-white">
                    {overview?.kpis.protectedEndpointsCount ?? endpointAgents.length}
                  </span>
                  <span className="text-xs text-slate-400">
                    of {overview?.kpis.totalManagedEndpointsCount ?? endpointAgents.length} Online Agents
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    File Dedup: {overview?.kpis.fileDedupEndpoints ?? endpointAgents.length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    VSS/APFS/LVM: {overview?.kpis.vssSnapshotEndpoints ?? endpointAgents.length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Bare-Metal Images: {overview?.kpis.bareMetalEndpoints ?? 2}
                  </span>
                </div>
              </div>

              {/* Card 4: 3-2-1 Offsite Replication Health */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-semibold uppercase tracking-wider">3-2-1 Offsite Replication Health</span>
                  <Cloud className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-emerald-400">
                    {overview?.kpis.offsiteReplicationHealthPct ?? 100}%
                  </span>
                  <span className="text-xs text-slate-300 font-semibold">
                    Synced to Backblaze B2
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-300">
                  Est. Cloud Spend:{' '}
                  <strong className="text-emerald-300 font-mono">
                    ${overview?.kpis.estimatedMonthlyB2CostUsd ?? 31.28}/mo
                  </strong>{' '}
                  (@ $6.95/TB)
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  Last UNAS Pro → B2 Delta Sync: {formatRelativeTime(vaults[0]?.lastSyncToCloudAt)}
                </div>
              </div>
            </div>

            {/* Interactive 3-2-1 Architecture Pipeline Flow */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>Interactive 3-2-1 Ransomware-Proof Backup &amp; Replication Pipeline</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Zero plaintext secrets on endpoints • Client-side Content-Defined Chunking (CDC) • Append-Only Proxmox Gateway • Dual-Tier NAS + Cloud WORM
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSyncToB2('vault-unifi-unas-pro-01')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${busyAction?.startsWith('sync:') ? 'animate-spin' : ''}`} />
                    <span>Trigger Immediate 3-2-1 Cloud Sync</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 relative">
                {/* Stage 1: Endpoint Agent */}
                <div className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px] font-bold">
                        STAGE 1 • ENDPOINT SIDECAR
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="font-bold text-sm text-white">
                      Endpoint Agent (Kopia CDC Dedup + Zstd + AES-256-GCM)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Triggered via Windows VSS / macOS APFS <code className="text-slate-300">tmutil</code> / Linux LVM. Splits files &amp; VHDX images into 4 MB Buzhash content-addressed chunks before leaving the host.
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Client Dedup Hit:</span>
                    <strong className="font-mono text-emerald-300">98.4% • 0 CLI Secrets</strong>
                  </div>
                </div>

                {/* Stage 2: Proxmox Kopia Server Gateway */}
                <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold">
                        STAGE 2 • APPEND-ONLY GATEWAY
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">0.4ms LAN</span>
                    </div>
                    <div className="font-bold text-sm text-white">
                      Proxmox Kopia Server Gateway (Append-Only ACLs)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      gRPC/HTTP2 mTLS gateway on <code className="text-purple-300">192.168.11.19:51515</code> with local NVMe index cache. Enforces <code className="text-emerald-300">--append-only</code> so compromised endpoints cannot delete snapshots.
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">NVMe Index Cache:</span>
                    <strong className="font-mono text-purple-300">99.7% Hit Rate</strong>
                  </div>
                </div>

                {/* Stage 3: UniFi NAS (UNAS Pro 10GbE NFS) */}
                <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                        STAGE 3 • TIER-1 LAN VAULT
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">1.84 Gbps</span>
                    </div>
                    <div className="font-bold text-sm text-white">
                      UniFi NAS (UNAS Pro 10GbE NFS)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      High-speed primary storage at <code className="text-indigo-300">192.168.11.25:/volume1/apexvault_kopia_repo</code>. Delivers instant LAN file restores &amp; Proxmox P2V VM boot in seconds.
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Physical Used:</span>
                    <strong className="font-mono text-indigo-300">4.50 TB / 64 TB (7%)</strong>
                  </div>
                </div>

                {/* Stage 4: Backblaze B2 (S3 Object Lock WORM) */}
                <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                        STAGE 4 • TIER-2 OFFSITE WORM
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">940 Mbps Sync</span>
                    </div>
                    <div className="font-bold text-sm text-white">
                      Backblaze B2 (S3 Object Lock WORM)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Offsite replication to <code className="text-amber-300">s3.us-west-004.backblazeb2.com</code> with 90-day <code className="text-emerald-300">COMPLIANCE</code> Object Lock &amp; scoped per-tenant keys via <code className="text-amber-200">b2_create_key</code>.
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Wholesale Rate:</span>
                    <strong className="font-mono text-amber-300">$6.95/TB • 0 Delete API</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Backup, Restore & Verification Jobs Feed */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider">
                    Recent Backup, Restore &amp; SHA-256 Verification Jobs
                  </h2>
                  <p className="text-xs text-slate-400">
                    Real-time job telemetry across Phase 1 File Dedup, Phase 2 VSS/APFS/LVM Snapshots, and Phase 3 Bare-Metal Images
                  </p>
                </div>
                <button
                  onClick={() => setSubTab('backups-snapshots')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>Browse All Snapshots</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Job #</th>
                      <th className="py-2.5 px-3">Tenant &amp; Endpoint</th>
                      <th className="py-2.5 px-3">Job Type / Phase</th>
                      <th className="py-2.5 px-3">Progress &amp; Throughput</th>
                      <th className="py-2.5 px-3">Logical → Dedup Written</th>
                      <th className="py-2.5 px-3">Execution Summary</th>
                      <th className="py-2.5 px-3 text-right">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {jobs.map(job => (
                      <tr key={job.id} className="hover:bg-slate-900/50 transition">
                        <td className="py-3 px-3 font-mono font-bold text-emerald-300 whitespace-nowrap">
                          {job.jobNumber}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{job.deviceName || 'Multi-Tenant Vault Sync'}</div>
                          <div className="text-[11px] text-slate-400">{job.clientName}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${MODE_LABELS[job.mode]?.color || 'bg-slate-800 text-slate-300'}`}>
                            {job.jobType.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-emerald-400">{job.progressPct}%</span>
                            <span className="font-mono text-slate-400">
                              {job.transferRateMbps > 0 ? `${job.transferRateMbps} Mbps` : 'API Instant'}
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${job.progressPct}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                          <span className="text-slate-300">{formatBytes(job.logicalBytesProcessed)}</span>
                          <span className="text-slate-500 mx-1">→</span>
                          <span className="text-emerald-300 font-bold">{formatBytes(job.deduplicatedBytesWritten)}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300 max-w-md">
                          {job.details}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(job.completedAt || job.startedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 2: SNAPSHOTS & TIME-MACHINE FILE BROWSER                      */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-snapshots' && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={snapSearchQuery}
                    onChange={e => setSnapSearchQuery(e.target.value)}
                    placeholder="Filter by host, SHA-256 hash, or filename..."
                    className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 w-64"
                  />
                </div>

                <select
                  value={snapClientFilter}
                  onChange={e => setSnapClientFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="all">All Client Tenants</option>
                  <option value="c-gambinos">Gambinos</option>
                  <option value="c-municipality">City of Auburn Utilities</option>
                  <option value="c-brandon-ray">Raytreat / DevStudio</option>
                  <option value="c-tbi">The Broken iPhone (TBI)</option>
                </select>

                <select
                  value={snapDeviceFilter}
                  onChange={e => setSnapDeviceFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="all">All Protected Devices</option>
                  {endpointAgents.map(a => (
                    <option key={a.deviceId} value={a.deviceId}>
                      {a.hostname}
                    </option>
                  ))}
                </select>

                <select
                  value={snapModeFilter}
                  onChange={e => setSnapModeFilter(e.target.value as BackupMode | 'all')}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="all">All Backup Modes (Phase 1–3)</option>
                  <option value="file_object_dedup">Phase 1: File/Object Dedup</option>
                  <option value="volume_snapshot_vss">Phase 2: Atomic Volume Snapshot (VSS/APFS/LVM)</option>
                  <option value="bare_metal_image">Phase 3: Bare-Metal Image (VHDX/Raw + EFI)</option>
                </select>
              </div>

              <button
                onClick={() => setShowRunBackupModal(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Create On-Demand Snapshot</span>
              </button>
            </div>

            {/* Split View: Snapshot List (Left) + Snapshot Inspector & File Browser (Right) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Left 5 Cols: Snapshot List */}
              <div className="xl:col-span-5 space-y-2.5">
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
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/25 border-emerald-500/60 shadow-lg shadow-emerald-950/30'
                          : 'bg-[#111827] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{snap.deviceName}</span>
                            <span className="text-[11px] text-slate-400">({snap.clientName})</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${MODE_LABELS[snap.mode].color}`}>
                              {MODE_LABELS[snap.mode].badge}
                            </span>
                            {snap.replicatedToB2 && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                3-2-1 B2 WORM
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-emerald-400">
                            {formatBytes(snap.logicalBytes)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            → {formatBytes(snap.storedDeduplicatedBytes)} ({snap.dedupSavingsPct}% saved)
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono text-slate-300">
                          Manifest: {snap.manifestId.slice(0, 12)}...
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {snap.verificationStatus === 'verified_ok' ? 'SHA-256 Verified' : 'Completed'} • {formatRelativeTime(snap.completedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right 7 Cols: Interactive Snapshot Inspector & File Browser */}
              <div className="xl:col-span-7">
                {activeSnapshot ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-white">
                            Snapshot Inspector: {activeSnapshot.deviceName}
                          </h3>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                            {activeSnapshot.verificationStatus === 'verified_ok' ? 'SHA-256 INTEGRITY VERIFIED' : 'COMPLETED'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Policy: {activeSnapshot.policyName} • Vault: {activeSnapshot.vaultName}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleVerifySnapshot(activeSnapshot.id)}
                          disabled={busyAction === `verify:${activeSnapshot.id}`}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Verify Chunk Integrity (SHA-256 Scrub)</span>
                        </button>

                        <button
                          onClick={() => {
                            setNewBmrSnapshotId(activeSnapshot.id);
                            setShowNewBmrModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Disc className="w-3.5 h-3.5" />
                          <span>Boot BMR / P2V</span>
                        </button>
                      </div>
                    </div>

                    {/* Cryptographic & Volume Shadow Metadata Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          SHA-256 Root Manifest Hash
                        </div>
                        <div className="font-mono text-[11px] text-emerald-300 break-all mt-1">
                          {activeSnapshot.sha256RootHash}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Atomic Snapshot Source (VSS / APFS / LVM)
                        </div>
                        <div className="font-mono text-[11px] text-indigo-300 break-all mt-1">
                          {activeSnapshot.vssShadowCopyPath || '\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy14'}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          WORM S3 Object Lock Expiration
                        </div>
                        <div className="font-mono text-[11px] text-amber-300 mt-1 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked Until {new Date(activeSnapshot.immutableUntil).toLocaleDateString()} (COMPLIANCE Mode)</span>
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Bare-Metal Partition &amp; Bootloader Capture
                        </div>
                        <div className="text-[11px] text-slate-200 mt-1 flex items-center gap-2">
                          <span className={activeSnapshot.partitionLayoutCaptured ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            GPT/MBR Table: {activeSnapshot.partitionLayoutCaptured ? 'Captured' : 'N/A'}
                          </span>
                          <span>•</span>
                          <span className={activeSnapshot.bootEfiCaptured ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            UEFI/BCD/GRUB: {activeSnapshot.bootEfiCaptured ? 'Captured' : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Browsable Files & VHDX Blocks Table */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Time-Machine Snapshot Contents ({activeSnapshot.fileCount.toLocaleString()} files • {activeSnapshot.dirCount.toLocaleString()} dirs)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Select files/blocks below for instant granular restore
                        </span>
                      </div>

                      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                              <th className="py-2 px-3 w-8">Sel</th>
                              <th className="py-2 px-3">Path / Block Object</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3">Size</th>
                              <th className="py-2 px-3">CDC Chunks</th>
                              <th className="py-2 px-3">SHA-256 Object Hash</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {activeSnapshot.filesPreview.map(entry => {
                              const checked = selectedFilePaths.includes(entry.path);
                              return (
                                <tr
                                  key={entry.path}
                                  onClick={() => toggleFileSelection(entry.path)}
                                  className={`cursor-pointer transition ${
                                    checked ? 'bg-emerald-950/30 text-white' : 'hover:bg-slate-900/50 text-slate-300'
                                  }`}
                                >
                                  <td className="py-2.5 px-3">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {}}
                                      className="accent-emerald-500 rounded cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-200 break-all">
                                    {entry.path}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                      {entry.type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                    {formatBytes(entry.sizeBytes)}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-400">
                                    {entry.chunksCount || 1}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                                    {entry.sha256 ? `${entry.sha256.slice(0, 16)}...` : 'verified'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* One-Click Granular Restore Action Bar */}
                    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
                          Granular Restore Target Path (Original Path or Custom Recovery Folder)
                        </label>
                        <input
                          type="text"
                          value={restoreTargetPath}
                          onChange={e => setRestoreTargetPath(e.target.value)}
                          placeholder="C:\Restored\ or /tmp/restored"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setRestoreTargetPath('ORIGINAL_IN_PLACE_PATH')}
                          className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Use Original Path
                        </button>
                        <button
                          onClick={() => handleRestoreSnapshot(activeSnapshot.id)}
                          disabled={busyAction === `restore:${activeSnapshot.id}`}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore Selected File/Folder ({selectedFilePaths.length || 'All'})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
                    No snapshots match the current filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 3: STORAGE VAULTS (UNIFI NAS & BACKBLAZE B2 API)              */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-vaults' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Configured 3-2-1 Storage Vaults (UniFi UNAS Pro LAN &amp; Backblaze B2 WORM Cloud)
                </h2>
                <p className="text-xs text-slate-400">
                  Primary LAN NFS v4.2 repository paired with Backblaze B2 S3-Compatible Object Lock storage
                </p>
              </div>
              <button
                onClick={() => setShowAddVaultModal(true)}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Storage Vault</span>
              </button>
            </div>

            {/* Vault Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vaults.map(vault => {
                const isUnifi = vault.backendType === 'unifi_nas_kopia';
                return (
                  <div
                    key={vault.id}
                    className={`bg-[#111827] border rounded-xl p-5 space-y-4 ${
                      isUnifi ? 'border-indigo-500/40' : 'border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            isUnifi ? 'bg-indigo-500/20 text-indigo-300' : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {isUnifi ? <Server className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white">{vault.name}</h3>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                              ONLINE
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{vault.description}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">Endpoint / Gateway</div>
                        <div className="font-mono text-[11px] text-slate-200 truncate mt-0.5" title={vault.endpointUrl}>
                          {vault.endpointUrl}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">
                          {isUnifi ? 'UniFi NFS Export Path' : 'B2 Bucket & Region'}
                        </div>
                        <div className="font-mono text-[11px] text-emerald-300 truncate mt-0.5">
                          {isUnifi
                            ? `${vault.unifiNasIp || '192.168.11.25'}:${vault.unifiNfsExport || '/volume1/apexvault_kopia_repo'}`
                            : `${vault.b2BucketName || 'apexmsp-worm-vault-prod'} (${vault.region || 'us-west-004'})`}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">Immutability &amp; Lock</div>
                        <div className="font-mono text-[11px] text-amber-300 mt-0.5">
                          {vault.immutableLockMode || 'COMPLIANCE'} ({vault.immutableRetentionDays}d WORM)
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">Encryption &amp; Splitter</div>
                        <div className="font-mono text-[11px] text-slate-200 mt-0.5">
                          AES-256-GCM • {vault.chunkSplitter}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">Logical → Physical</div>
                        <div className="font-mono text-[11px] text-emerald-300 mt-0.5">
                          {formatBytes(vault.logicalProtectedBytes)} → {formatBytes(vault.storedDeduplicatedBytes)} ({vault.dedupRatio}x)
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[10px] text-slate-400 uppercase">
                          {isUnifi ? 'NVMe Cache Hit Rate' : 'Append-Only Key Policy'}
                        </div>
                        <div className="font-mono text-[11px] text-indigo-300 mt-0.5">
                          {isUnifi ? '99.7% (Proxmox Local NVMe)' : 'deleteFiles BLOCKED'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                      <span className="text-slate-400">
                        Last Cloud Sync: <strong className="text-slate-200">{formatRelativeTime(vault.lastSyncToCloudAt)}</strong>
                      </span>
                      <button
                        onClick={() => handleSyncToB2(vault.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${busyAction === `sync:${vault.id}` ? 'animate-spin' : ''}`} />
                        <span>Sync Vault to Backblaze B2</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Backblaze B2 Tenant Key Provisioner (b2_create_key) + Cost Calculator */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Left 7 Cols: Interactive Backblaze B2 Tenant Key Provisioner */}
              <div className="xl:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      <span>Backblaze B2 Tenant Key Provisioner (<code className="text-amber-300">b2_create_key</code>)</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Automatically mints per-tenant scoped B2 Application Keys restricted to prefix <code className="text-slate-200">tenants/&lt;clientId&gt;/</code> with <code className="text-rose-400">deleteFiles</code> explicitly omitted.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                      Select Client Tenant
                    </label>
                    <select
                      value={b2KeyTenantId}
                      onChange={e => setB2KeyTenantId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="c-gambinos">Gambinos (c-gambinos)</option>
                      <option value="c-municipality">City of Auburn Utilities (c-municipality)</option>
                      <option value="c-brandon-ray">Raytreat / DevStudio (c-brandon-ray)</option>
                      <option value="c-tbi">The Broken iPhone (c-tbi)</option>
                      <option value="c-sos-volleyball">SOS Volleyball (c-sos-volleyball)</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                      Target B2 WORM Bucket
                    </label>
                    <input
                      type="text"
                      value={b2KeyBucketName}
                      onChange={e => setB2KeyBucketName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                  </div>

                  <button
                    onClick={handleMintB2Key}
                    disabled={busyAction?.startsWith('b2key:')}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer shadow-lg shadow-amber-950/50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Mint Append-Only B2 Application Key</span>
                  </button>
                </div>

                {/* Provisioned Keys Table */}
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                        <th className="py-2 px-3">Tenant</th>
                        <th className="py-2 px-3">Scoped Key ID</th>
                        <th className="py-2 px-3">Bucket Prefix</th>
                        <th className="py-2 px-3">Allowed Capabilities</th>
                        <th className="py-2 px-3">Blocked (Ransomware Guard)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {b2Keys.map(k => (
                        <tr key={k.keyId} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 font-bold text-white">{k.clientName}</td>
                          <td className="py-2.5 px-3 font-mono text-amber-300 text-[11px]">{k.keyId}</td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 text-[11px]">{k.namePrefix}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {['listBuckets', 'listFiles', 'readFiles', 'writeFiles'].map(cap => (
                                <span
                                  key={cap}
                                  className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[10px]"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-[10px] font-bold">
                              deleteFiles BLOCKED
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right 5 Cols: Cloud Storage Economics Calculator ($6.95/TB B2 vs Wasabi vs Cloudflare R2) */}
              <div className="xl:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    MSP Offsite Cloud Economics Calculator (Backblaze B2 vs. Wasabi / R2)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Compare monthly wholesale cost with Kopia 4.1x deduplication &amp; free B2 egress up to 3x stored data
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Logical Protected Fleet Data:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {(b2CalcTb * 4.1).toFixed(1)} TB Logical → {b2CalcTb} TB Deduplicated Physical
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={b2CalcTb}
                    onChange={e => setB2CalcTb(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>1 TB Physical (4.1 TB Logical)</span>
                    <span>50 TB Physical</span>
                    <span>100 TB Physical (410 TB Logical)</span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>Backblaze B2 Reserve / Pay-As-You-Go</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                          SELECTED TIER-2
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        $6.95/TB/mo • No 90-day minimum deletion penalty • Native S3 Object Lock
                      </div>
                    </div>
                    <div className="text-right font-mono font-black text-lg text-emerald-400">
                      ${(b2CalcTb * 6.95).toFixed(2)}/mo
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">Wasabi Hot Cloud Storage</div>
                      <div className="text-[11px] text-slate-400">
                        $6.99/TB/mo + 90-day minimum storage duration penalty on compacted chunks
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-sm text-slate-300">
                      ${(b2CalcTb * 6.99 * 1.25).toFixed(2)}/mo eff.
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">Cloudflare R2</div>
                      <div className="text-[11px] text-slate-400">
                        $15.00/TB/mo (2.15x more expensive for multi-TB image backups)
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-sm text-rose-400">
                      ${(b2CalcTb * 15.0).toFixed(2)}/mo
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 4: POLICIES & PHASE 1-3 SCHEDULES                             */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-policies' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Multi-Tenant Backup Policies &amp; Phase 1–3 Schedules
                </h2>
                <p className="text-xs text-slate-400">
                  Configure File/Object Dedup (Phase 1), Atomic VSS/APFS/LVM Volume Snapshots (Phase 2), and Full Bare-Metal + UEFI Images (Phase 3)
                </p>
              </div>
              <button
                onClick={() => setShowNewPolicyModal(true)}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Backup Policy</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {policies.map(pol => (
                <div
                  key={pol.id}
                  className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-sm text-white">{pol.name}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-semibold">
                          Tenant: {pol.clientName}
                        </span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${MODE_LABELS[pol.mode].color}`}>
                          {MODE_LABELS[pol.mode].badge}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 font-mono">
                        Cron: <span className="text-emerald-300">{pol.scheduleCron}</span> ({pol.scheduleLabel}) • S3 Object Lock:{' '}
                        <span className="text-amber-300">{pol.immutableLockDays} Days COMPLIANCE</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pol.enabled}
                          onChange={e => handleTogglePolicy(pol, 'enabled', e.target.checked)}
                          className="accent-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <span className={pol.enabled ? 'text-emerald-400' : 'text-slate-500'}>
                          {pol.enabled ? 'Policy Active' : 'Paused'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Interactive Toggles for VSS / APFS / LVM / Partition Table / EFI */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => handleTogglePolicy(pol, 'enableWindowsVss', !pol.enableWindowsVss)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        pol.enableWindowsVss
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">Windows VSS</div>
                      <div className="font-mono font-bold mt-0.5">
                        {pol.enableWindowsVss ? 'ENABLED (ShadowCopy)' : 'Disabled'}
                      </div>
                    </button>

                    <button
                      onClick={() => handleTogglePolicy(pol, 'enableApfsSnapshot', !pol.enableApfsSnapshot)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        pol.enableApfsSnapshot
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">macOS APFS tmutil</div>
                      <div className="font-mono font-bold mt-0.5">
                        {pol.enableApfsSnapshot ? 'ENABLED (LocalSnap)' : 'Disabled'}
                      </div>
                    </button>

                    <button
                      onClick={() => handleTogglePolicy(pol, 'enableLvmSnapshot', !pol.enableLvmSnapshot)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        pol.enableLvmSnapshot
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">Linux LVM Snapshot</div>
                      <div className="font-mono font-bold mt-0.5">
                        {pol.enableLvmSnapshot ? 'ENABLED (lvcreate -s)' : 'Disabled'}
                      </div>
                    </button>

                    <button
                      onClick={() => handleTogglePolicy(pol, 'capturePartitionTable', !pol.capturePartitionTable)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        pol.capturePartitionTable
                          ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">GPT/MBR Partition Table</div>
                      <div className="font-mono font-bold mt-0.5">
                        {pol.capturePartitionTable ? 'CAPTURED (BMR)' : 'Skipped'}
                      </div>
                    </button>

                    <button
                      onClick={() => handleTogglePolicy(pol, 'captureEfiBootloader', !pol.captureEfiBootloader)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        pol.captureEfiBootloader
                          ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-200'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold">UEFI / BCD / GRUB</div>
                      <div className="font-mono font-bold mt-0.5">
                        {pol.captureEfiBootloader ? 'CAPTURED (Bootable)' : 'Skipped'}
                      </div>
                    </button>

                    <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/80">
                      <div className="text-[10px] uppercase font-bold text-slate-400">GFS Retention</div>
                      <div className="font-mono text-[11px] text-amber-300 mt-0.5">
                        {pol.retention.hourly}H • {pol.retention.daily}D • {pol.retention.weekly}W • {pol.retention.monthly}M • {pol.retention.annual}Y
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div>
                      Include Paths:{' '}
                      <span className="font-mono text-slate-200">{pol.includePaths.join(', ')}</span>
                    </div>
                    <div>
                      Exclude Patterns:{' '}
                      <span className="font-mono text-slate-400">{pol.excludePatterns.join(', ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 5: BARE-METAL RECOVERY (BMR) & PROXMOX P2V CENTER             */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-bmr' && (
          <div className="space-y-5">
            <div className="bg-gradient-to-r from-amber-950/40 via-[#111827] to-indigo-950/40 border border-amber-500/30 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Disc className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base font-black text-white">
                    Phase 3: Bare-Metal Recovery (BMR) &amp; Proxmox VE Instant P2V Center
                  </h2>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Boot any blank replacement workstation, dissimilar hardware, or Proxmox VM from the ApexMSP Live Recovery ISO (WinPE / Alpine Linux), enter the 6-digit pairing code, and stream deduplicated blocks + GPT/UEFI + VirtIO drivers over 10GbE LAN.
                </p>
              </div>
              <button
                onClick={() => setShowNewBmrModal(true)}
                className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 shrink-0 shadow-lg shadow-amber-950/50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Launch Bare-Metal Recovery Session</span>
              </button>
            </div>

            {/* Active BMR Sessions List */}
            <div className="space-y-4">
              {bmrSessions.map(sess => {
                const currentStageIndex = BMR_STAGE_PIPELINE.findIndex(st => st.key === sess.status);
                const bootCmd = `openmsp-agent --recovery-code ${sess.pairingCode} --server https://api.apexmsp.app`;
                return (
                  <div
                    key={sess.id}
                    className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm"
                  >
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 font-mono font-black text-sm text-amber-300 tracking-wider">
                            PAIRING CODE: {sess.pairingCode}
                          </span>
                          <span className="font-black text-base text-white">
                            {sess.sourceDeviceName} ({sess.clientName})
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
                            {sess.targetHardwareProfile === 'proxmox_vm_p2v'
                              ? 'Proxmox VE P2V Instant VM Restore'
                              : sess.targetHardwareProfile === 'dissimilar_hardware_virtio'
                              ? 'Dissimilar Hardware + VirtIO Driver Injection'
                              : 'Same Hardware Replacement'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Snapshot: {sess.snapshotId} • Manifest: {sess.manifestId} • Bootloader: {sess.bootloaderType.toUpperCase()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {sess.status !== 'completed' ? (
                          <button
                            onClick={() => handleAdvanceBmrSession(sess.id)}
                            disabled={busyAction === `adv-bmr:${sess.id}`}
                            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Advance Recovery Step Live ({sess.progressPct}%)</span>
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Bare-Metal Recovery Completed (100%)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Exact Live ISO Boot Command & Captured Partition Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400 mb-1">
                          <span className="flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Live Recovery ISO One-Line Boot Command</span>
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(bootCmd);
                              showToastMsg('success', `Copied recovery command for code ${sess.pairingCode}`);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>
                        </div>
                        <code className="text-xs font-mono text-emerald-300 break-all block">
                          {bootCmd}
                        </code>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Captured GPT / UEFI Partition Table Layout
                        </div>
                        <div className="text-xs font-mono text-indigo-300">
                          {sess.partitionLayoutSummary}
                        </div>
                      </div>
                    </div>

                    {/* 6-Stage Step-by-Step Recovery Pipeline */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                      {BMR_STAGE_PIPELINE.map((stage, idx) => {
                        const isDone = idx < currentStageIndex || sess.status === 'completed';
                        const isCurrent = idx === currentStageIndex && sess.status !== 'completed';
                        return (
                          <div
                            key={stage.key}
                            className={`p-3 rounded-lg border transition ${
                              isDone
                                ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                                : isCurrent
                                ? 'bg-amber-950/30 border-amber-500/60 text-amber-200 ring-1 ring-amber-500/40'
                                : 'bg-slate-900/50 border-slate-800 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                              <span>STEP {idx + 1}</span>
                              {isDone ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : isCurrent ? (
                                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-slate-600" />
                              )}
                            </div>
                            <div className="font-bold text-xs text-white">{stage.label}</div>
                            <div className="text-[10px] opacity-80 mt-0.5">{stage.sub}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 6: ENDPOINT SIDECAR TELEMETRY (KOPIA AGENTS)                  */}
        {/* ----------------------------------------------------------------- */}
        {currentTab === 'backups-agents' && (
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Managed Endpoint Sidecar Telemetry (<code className="text-emerald-400">kopia</code> Binary Agents)
                </h2>
                <p className="text-xs text-slate-400">
                  Go agent <code className="text-slate-200">backup_worker.go</code> verifies sidecar SHA-256 hash before execution and passes credentials exclusively via ephemeral OS environment variables
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Endpoint &amp; Tenant</th>
                    <th className="py-2.5 px-3">OS</th>
                    <th className="py-2.5 px-3">Kopia Sidecar &amp; SHA-256</th>
                    <th className="py-2.5 px-3">Gateway &amp; Append-Only</th>
                    <th className="py-2.5 px-3">Atomic Volume Engine</th>
                    <th className="py-2.5 px-3">Logical → Dedup (Ratio)</th>
                    <th className="py-2.5 px-3 text-right">One-Click Agent Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {endpointAgents.map(agent => (
                    <tr key={agent.deviceId} className="hover:bg-slate-900/50 transition">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{agent.hostname}</div>
                        <div className="text-[11px] text-slate-400">
                          {agent.clientName} • <span className="font-mono">{agent.ipAddress}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] uppercase">
                          {agent.os}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{agent.osVersion}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-mono text-emerald-300 font-bold">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{agent.report.kopiaVersion} (SHA-256 Verified)</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                          {agent.report.kopiaBinaryPath}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[11px] text-indigo-300">
                          {agent.report.repositoryConnected ? 'Connected (mTLS)' : 'Disconnected'}
                        </div>
                        <span className="inline-flex mt-0.5 px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono">
                          Append-Only Enforced
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {agent.report.vssAvailable && (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                            Windows VSS Ready
                          </span>
                        )}
                        {agent.report.apfsSnapshotAvailable && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                            macOS APFS tmutil Ready
                          </span>
                        )}
                        {agent.report.lvmSnapshotAvailable && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Linux LVM Snapshot Ready
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                        <span className="text-white">{formatBytes(agent.report.logicalBytesTotal)}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="text-emerald-400 font-bold">{formatBytes(agent.report.deduplicatedBytesTotal)}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                          {agent.report.dedupRatio}x
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleTriggerBackup(agent.deviceId, 'file_object_dedup')}
                            className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[10px] font-bold cursor-pointer"
                          >
                            Trigger File Dedup
                          </button>
                          <button
                            onClick={() => handleTriggerBackup(agent.deviceId, 'volume_snapshot_vss')}
                            className="px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold cursor-pointer"
                          >
                            Trigger VSS Snapshot
                          </button>
                          <button
                            onClick={() => handleTriggerBackup(agent.deviceId, 'bare_metal_image')}
                            className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold cursor-pointer"
                          >
                            Capture Bare-Metal Image
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

      {/* ===================================================================== */}
      {/* MODAL 1: RUN BACKUP NOW                                               */}
      {/* ===================================================================== */}
      {showRunBackupModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Run On-Demand Backup Snapshot</span>
              </h3>
              <button onClick={() => setShowRunBackupModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Target Managed Endpoint</label>
                <select
                  value={runBackupDeviceId}
                  onChange={e => setRunBackupDeviceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  {endpointAgents.map(a => (
                    <option key={a.deviceId} value={a.deviceId}>
                      {a.hostname} ({a.clientName} • {a.os.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Backup Mode (Phase 1–3)</label>
                <select
                  value={runBackupMode}
                  onChange={e => setRunBackupMode(e.target.value as BackupMode)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  <option value="file_object_dedup">Phase 1: File/Object Dedup (Buzhash 4M CDC + Zstd)</option>
                  <option value="volume_snapshot_vss">Phase 2: Atomic Volume Snapshot (Windows VSS / macOS APFS / Linux LVM)</option>
                  <option value="bare_metal_image">Phase 3: Full Bare-Metal Image (VHDX/Raw + GPT Partition Table + UEFI/BCD)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Include Paths / Volumes</label>
                <input
                  type="text"
                  value={runBackupIncludePath}
                  onChange={e => setRunBackupIncludePath(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowRunBackupModal(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
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
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Dispatch Backup Command</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: NEW BARE-METAL RECOVERY ISO SESSION                          */}
      {/* ===================================================================== */}
      {showNewBmrModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBmrSession}
            className="bg-[#111827] border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Disc className="w-4 h-4 text-amber-400" />
                <span>New Bare-Metal Recovery (BMR) / Proxmox P2V Session</span>
              </h3>
              <button type="button" onClick={() => setShowNewBmrModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Source Snapshot to Restore</label>
                <select
                  value={newBmrSnapshotId}
                  onChange={e => setNewBmrSnapshotId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.deviceName} ({s.clientName}) — {MODE_LABELS[s.mode].short} • {formatBytes(s.logicalBytes)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Target Hardware / Hypervisor Profile</label>
                <select
                  value={newBmrProfile}
                  onChange={e => setNewBmrProfile(e.target.value as BareMetalRecoverySession['targetHardwareProfile'])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  <option value="proxmox_vm_p2v">Proxmox VE P2V Instant VM Restore (10GbE LAN Stream)</option>
                  <option value="dissimilar_hardware_virtio">Dissimilar Hardware + VirtIO SCSI/Net Driver Injection</option>
                  <option value="same_hardware">Same Hardware Replacement (Identical Disk/Controller)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Bootloader Mode</label>
                  <select
                    value={newBmrBootloader}
                    onChange={e => setNewBmrBootloader(e.target.value as 'uefi_gpt' | 'bios_mbr')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                  >
                    <option value="uefi_gpt">UEFI + GPT (bcdboot / efibootmgr)</option>
                    <option value="bios_mbr">Legacy BIOS + MBR</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newBmrVirtio}
                      onChange={e => setNewBmrVirtio(e.target.checked)}
                      className="accent-amber-500 w-4 h-4"
                    />
                    <span className="font-bold text-amber-300">Inject VirtIO Drivers (dism / dracut)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewBmrModal(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Generate 6-Digit Live ISO Pairing Code</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: ADD STORAGE VAULT                                            */}
      {/* ===================================================================== */}
      {showAddVaultModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateVault}
            className="bg-[#111827] border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Add New Storage Vault (UniFi NAS / Backblaze B2 / S3)
              </h3>
              <button type="button" onClick={() => setShowAddVaultModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Vault Display Name</label>
                <input
                  type="text"
                  value={newVaultName}
                  onChange={e => setNewVaultName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Storage Backend Architecture</label>
                <select
                  value={newVaultBackend}
                  onChange={e => setNewVaultBackend(e.target.value as BackupStorageBackendType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                >
                  <option value="unifi_nas_kopia">UniFi NAS (10GbE NFS -&gt; Proxmox Kopia Append-Only Gateway)</option>
                  <option value="backblaze_b2">Backblaze B2 Cloud ($6.95/TB • S3 Object Lock COMPLIANCE)</option>
                  <option value="s3_compatible">S3-Compatible Object Storage (MinIO / Wasabi / AWS S3)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Gateway or S3 Endpoint URL</label>
                <input
                  type="text"
                  value={newVaultEndpoint}
                  onChange={e => setNewVaultEndpoint(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">NFS Export or Bucket Name</label>
                  <input
                    type="text"
                    value={newVaultNfsOrBucket}
                    onChange={e => setNewVaultNfsOrBucket(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">WORM Object Lock Days</label>
                  <input
                    type="number"
                    value={newVaultRetentionDays}
                    onChange={e => setNewVaultRetentionDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddVaultModal(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePolicy}
            className="bg-[#111827] border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Create Multi-Tenant Backup Policy (Phase 1–3)
              </h3>
              <button type="button" onClick={() => setShowNewPolicyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Policy Name</label>
                <input
                  type="text"
                  value={newPolicyName}
                  onChange={e => setNewPolicyName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Client Tenant</label>
                  <select
                    value={newPolicyClientId}
                    onChange={e => setNewPolicyClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                  >
                    <option value="c-gambinos">Gambinos</option>
                    <option value="c-municipality">City of Auburn Utilities</option>
                    <option value="c-brandon-ray">Raytreat / DevStudio</option>
                    <option value="c-tbi">The Broken iPhone (TBI)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Backup Mode</label>
                  <select
                    value={newPolicyMode}
                    onChange={e => setNewPolicyMode(e.target.value as BackupMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                  >
                    <option value="file_object_dedup">Phase 1: File/Object Dedup</option>
                    <option value="volume_snapshot_vss">Phase 2: Atomic Volume Snapshot</option>
                    <option value="bare_metal_image">Phase 3: Bare-Metal Image</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Cron Schedule</label>
                  <input
                    type="text"
                    value={newPolicyCron}
                    onChange={e => setNewPolicyCron(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Schedule Label</label>
                  <input
                    type="text"
                    value={newPolicyScheduleLabel}
                    onChange={e => setNewPolicyScheduleLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">WORM Lock Days</label>
                  <input
                    type="number"
                    value={newPolicyLockDays}
                    onChange={e => setNewPolicyLockDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Include Paths (comma-separated)</label>
                <input
                  type="text"
                  value={newPolicyPaths}
                  onChange={e => setNewPolicyPaths(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyVss} onChange={e => setNewPolicyVss(e.target.checked)} className="accent-emerald-500" />
                  <span>Windows VSS Shadow Copy</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyApfs} onChange={e => setNewPolicyApfs(e.target.checked)} className="accent-emerald-500" />
                  <span>macOS APFS tmutil Snapshot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyLvm} onChange={e => setNewPolicyLvm(e.target.checked)} className="accent-emerald-500" />
                  <span>Linux LVM Snapshot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newPolicyPartition} onChange={e => setNewPolicyPartition(e.target.checked)} className="accent-emerald-500" />
                  <span>Capture GPT/MBR + UEFI Boot</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewPolicyModal(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
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
