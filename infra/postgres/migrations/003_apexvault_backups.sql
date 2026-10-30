-- OpenMSP / ApexMSP — Migration 003: ApexVault 3-2-1 Backup, Deduplication, Snapshots & Bare-Metal Recovery
-- Enforces Mandatory Supabase Oct 30 Explicit GRANT Rule (TKT-2026-1001)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure standard PostgREST/Supabase roles exist on standalone Postgres so explicit GRANTs always succeed
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. public.backup_storage_vaults (UniFi NAS Kopia Gateways & Backblaze B2 Cloud Vaults)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_storage_vaults (
  id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  backend_type TEXT NOT NULL CHECK (backend_type IN (
    'unifi_nas_kopia',
    'backblaze_b2',
    's3_compatible',
    'hybrid_321'
  )),
  endpoint_url TEXT NOT NULL,
  region TEXT,
  unifi_nas_ip TEXT,
  unifi_nfs_export TEXT,
  b2_bucket_name TEXT,
  b2_key_id TEXT,
  b2_application_key_restricted BOOLEAN NOT NULL DEFAULT true,
  immutable_object_lock BOOLEAN NOT NULL DEFAULT true,
  immutable_lock_mode TEXT DEFAULT 'COMPLIANCE' CHECK (immutable_lock_mode IN ('COMPLIANCE', 'GOVERNANCE')),
  immutable_retention_days INTEGER NOT NULL DEFAULT 30,
  append_only_enforced BOOLEAN NOT NULL DEFAULT true,
  encryption_algorithm TEXT NOT NULL DEFAULT 'AES256-GCM-HMAC-SHA256' CHECK (encryption_algorithm IN (
    'AES256-GCM-HMAC-SHA256',
    'CHACHA20-POLY1305-HMAC-SHA256'
  )),
  chunk_splitter TEXT NOT NULL DEFAULT 'DYNAMIC-4M-BUZHASH' CHECK (chunk_splitter IN (
    'DYNAMIC-4M-BUZHASH',
    'DYNAMIC-8M-RABIN'
  )),
  compression_algorithm TEXT NOT NULL DEFAULT 'zstd' CHECK (compression_algorithm IN (
    'zstd',
    'zstd-fastest',
    's2-default'
  )),
  capacity_bytes BIGINT NOT NULL DEFAULT 0,
  logical_protected_bytes BIGINT NOT NULL DEFAULT 0,
  stored_deduplicated_bytes BIGINT NOT NULL DEFAULT 0,
  dedup_ratio NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  online BOOLEAN NOT NULL DEFAULT true,
  connected_agents_count INTEGER NOT NULL DEFAULT 0,
  total_snapshots_count INTEGER NOT NULL DEFAULT 0,
  last_sync_to_cloud_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_storage_vaults_org ON public.backup_storage_vaults(org_id);
CREATE INDEX IF NOT EXISTS idx_backup_storage_vaults_backend ON public.backup_storage_vaults(org_id, backend_type);

-- ---------------------------------------------------------------------------
-- 2. public.backup_policies (Per-Client/Site GFS Retention, VSS/APFS/LVM & BMR Schedules)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_policies (
  id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'volume_snapshot_vss' CHECK (mode IN (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  target_os TEXT NOT NULL DEFAULT 'all' CHECK (target_os IN (
    'windows',
    'macos',
    'linux',
    'android',
    'ios',
    'all'
  )),
  schedule_cron TEXT NOT NULL DEFAULT '0 */4 * * *',
  schedule_label TEXT NOT NULL DEFAULT 'Every 4 hours',
  primary_vault_id TEXT NOT NULL REFERENCES public.backup_storage_vaults(id) ON DELETE RESTRICT,
  replicate_to_cloud_vault_id TEXT REFERENCES public.backup_storage_vaults(id) ON DELETE SET NULL,
  include_paths TEXT[] NOT NULL DEFAULT '{}',
  exclude_patterns TEXT[] NOT NULL DEFAULT '{}',
  enable_windows_vss BOOLEAN NOT NULL DEFAULT true,
  enable_apfs_snapshot BOOLEAN NOT NULL DEFAULT true,
  enable_lvm_snapshot BOOLEAN NOT NULL DEFAULT true,
  capture_partition_table BOOLEAN NOT NULL DEFAULT true,
  capture_efi_bootloader BOOLEAN NOT NULL DEFAULT true,
  compression_algorithm TEXT NOT NULL DEFAULT 'zstd' CHECK (compression_algorithm IN (
    'zstd',
    'zstd-fastest',
    's2-default'
  )),
  bandwidth_limit_mbps INTEGER,
  retention JSONB NOT NULL DEFAULT '{
    "latest": 24,
    "hourly": 48,
    "daily": 30,
    "weekly": 12,
    "monthly": 24,
    "annual": 7
  }'::jsonb,
  immutable_lock_days INTEGER NOT NULL DEFAULT 30,
  auto_verify_weekly BOOLEAN NOT NULL DEFAULT true,
  assigned_device_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_policies_org_client ON public.backup_policies(org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_backup_policies_vault ON public.backup_policies(primary_vault_id);

-- ---------------------------------------------------------------------------
-- 3. public.backup_snapshots (Immutable Kopia Manifests, VSS Metadata & File Previews)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT 'linux' CHECK (os IN ('windows', 'macos', 'linux', 'android', 'ios')),
  policy_id TEXT REFERENCES public.backup_policies(id) ON DELETE SET NULL,
  policy_name TEXT NOT NULL DEFAULT '',
  vault_id TEXT NOT NULL REFERENCES public.backup_storage_vaults(id) ON DELETE CASCADE,
  vault_name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'volume_snapshot_vss' CHECK (mode IN (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
    'completed',
    'running',
    'verifying',
    'verified',
    'failed'
  )),
  logical_bytes BIGINT NOT NULL DEFAULT 0,
  stored_deduplicated_bytes BIGINT NOT NULL DEFAULT 0,
  dedup_savings_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  file_count INTEGER NOT NULL DEFAULT 0,
  dir_count INTEGER NOT NULL DEFAULT 0,
  vss_shadow_copy_used BOOLEAN NOT NULL DEFAULT false,
  vss_shadow_copy_path TEXT,
  partition_layout_captured BOOLEAN NOT NULL DEFAULT false,
  boot_efi_captured BOOLEAN NOT NULL DEFAULT false,
  replicated_to_b2 BOOLEAN NOT NULL DEFAULT false,
  immutable_until TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending',
    'verified_ok',
    'corrupted'
  )),
  sha256_root_hash TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  files_preview JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_org_client ON public.backup_snapshots(org_id, client_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_device ON public.backup_snapshots(device_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_vault ON public.backup_snapshots(vault_id, status);

-- ---------------------------------------------------------------------------
-- 4. public.backup_jobs (Live Backup, Restore, Verification & B2 Sync Jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id TEXT PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  device_id TEXT,
  device_name TEXT,
  vault_id TEXT NOT NULL REFERENCES public.backup_storage_vaults(id) ON DELETE CASCADE,
  vault_name TEXT NOT NULL DEFAULT '',
  policy_id TEXT REFERENCES public.backup_policies(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'backup_file_dedup',
    'backup_full_snapshot',
    'backup_bare_metal',
    'restore_files',
    'restore_bare_metal_iso',
    'verify_integrity',
    'sync_unifi_to_b2',
    'provision_b2_tenant_key'
  )),
  mode TEXT NOT NULL DEFAULT 'volume_snapshot_vss' CHECK (mode IN (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',
    'running',
    'completed',
    'failed'
  )),
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  transfer_rate_mbps NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  logical_bytes_processed BIGINT NOT NULL DEFAULT 0,
  deduplicated_bytes_written BIGINT NOT NULL DEFAULT 0,
  command_id TEXT,
  snapshot_id TEXT REFERENCES public.backup_snapshots(id) ON DELETE SET NULL,
  target_restore_path TEXT,
  recovery_pairing_code TEXT,
  details TEXT NOT NULL DEFAULT '',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_org_client_status ON public.backup_jobs(org_id, client_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_device ON public.backup_jobs(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_vault ON public.backup_jobs(vault_id, status);

-- ---------------------------------------------------------------------------
-- 5. public.bare_metal_recovery_sessions (Bootable ISO Pairing & P2V Sessions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bare_metal_recovery_sessions (
  id TEXT PRIMARY KEY,
  pairing_code TEXT UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  source_device_id TEXT NOT NULL,
  source_device_name TEXT NOT NULL DEFAULT '',
  source_os TEXT NOT NULL DEFAULT 'windows' CHECK (source_os IN ('windows', 'macos', 'linux', 'android', 'ios')),
  snapshot_id TEXT NOT NULL REFERENCES public.backup_snapshots(id) ON DELETE CASCADE,
  manifest_id TEXT NOT NULL,
  vault_id TEXT NOT NULL REFERENCES public.backup_storage_vaults(id) ON DELETE CASCADE,
  vault_endpoint TEXT NOT NULL,
  target_hardware_profile TEXT NOT NULL DEFAULT 'same_hardware' CHECK (target_hardware_profile IN (
    'same_hardware',
    'dissimilar_hardware_virtio',
    'proxmox_vm_p2v'
  )),
  bootloader_type TEXT NOT NULL DEFAULT 'uefi_gpt' CHECK (bootloader_type IN ('uefi_gpt', 'bios_mbr')),
  partition_layout_summary TEXT NOT NULL DEFAULT '',
  inject_virtio_drivers BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'awaiting_iso_boot' CHECK (status IN (
    'awaiting_iso_boot',
    'iso_paired',
    'partitioning_disks',
    'streaming_dedup_blocks',
    'repairing_bootloader',
    'completed',
    'expired'
  )),
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bmr_sessions_org_client ON public.bare_metal_recovery_sessions(org_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_bmr_sessions_device ON public.bare_metal_recovery_sessions(source_device_id);
CREATE INDEX IF NOT EXISTS idx_bmr_sessions_vault ON public.bare_metal_recovery_sessions(vault_id);

-- ---------------------------------------------------------------------------
-- 6. public.device_backup_reports (Endpoint Kopia Agent Telemetry & VSS/APFS/LVM Readiness)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_backup_reports (
  device_id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL DEFAULT '',
  kopia_installed BOOLEAN NOT NULL DEFAULT false,
  kopia_version TEXT NOT NULL DEFAULT '',
  kopia_binary_path TEXT NOT NULL DEFAULT '',
  kopia_sha256_verified BOOLEAN NOT NULL DEFAULT false,
  repository_connected BOOLEAN NOT NULL DEFAULT false,
  vault_endpoint TEXT NOT NULL DEFAULT '',
  append_only_mode BOOLEAN NOT NULL DEFAULT true,
  vss_available BOOLEAN NOT NULL DEFAULT false,
  apfs_snapshot_available BOOLEAN NOT NULL DEFAULT false,
  lvm_snapshot_available BOOLEAN NOT NULL DEFAULT false,
  last_snapshot_id TEXT,
  last_snapshot_at TIMESTAMPTZ,
  logical_bytes_total BIGINT NOT NULL DEFAULT 0,
  deduplicated_bytes_total BIGINT NOT NULL DEFAULT 0,
  dedup_ratio NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  active_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'unconfigured' CHECK (status IN (
    'idle',
    'running_backup',
    'running_restore',
    'verifying',
    'error',
    'unconfigured'
  )),
  last_error TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_backup_reports_org_client ON public.device_backup_reports(org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_device_backup_reports_status ON public.device_backup_reports(org_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.backup_storage_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bare_metal_recovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_backup_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MANDATORY SUPABASE OCT 30 EXPLICIT GRANTS (TKT-2026-1001)
-- Explicit table, sequence, and default privilege grants for PostgREST roles
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_storage_vaults TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_policies TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_snapshots TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_jobs TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bare_metal_recovery_sessions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_backup_reports TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
