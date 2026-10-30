-- Supabase Migration 0004: ApexVault 3-2-1 Backup, Deduplication, Snapshots & Bare-Metal Recovery
-- Enforces Mandatory Supabase Oct 30 Explicit GRANT Rule (TKT-2026-1001) + Row Level Security (RLS)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. public.backup_storage_vaults (UniFi NAS Kopia Gateways & Backblaze B2 Cloud Vaults)
-- ---------------------------------------------------------------------------
create table if not exists public.backup_storage_vaults (
  id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text not null default '',
  backend_type text not null check (backend_type in (
    'unifi_nas_kopia',
    'backblaze_b2',
    's3_compatible',
    'hybrid_321'
  )),
  endpoint_url text not null,
  region text,
  unifi_nas_ip text,
  unifi_nfs_export text,
  b2_bucket_name text,
  b2_key_id text,
  b2_application_key_restricted boolean not null default true,
  immutable_object_lock boolean not null default true,
  immutable_lock_mode text default 'COMPLIANCE' check (immutable_lock_mode in ('COMPLIANCE', 'GOVERNANCE')),
  immutable_retention_days integer not null default 30,
  append_only_enforced boolean not null default true,
  encryption_algorithm text not null default 'AES256-GCM-HMAC-SHA256' check (encryption_algorithm in (
    'AES256-GCM-HMAC-SHA256',
    'CHACHA20-POLY1305-HMAC-SHA256'
  )),
  chunk_splitter text not null default 'DYNAMIC-4M-BUZHASH' check (chunk_splitter in (
    'DYNAMIC-4M-BUZHASH',
    'DYNAMIC-8M-RABIN'
  )),
  compression_algorithm text not null default 'zstd' check (compression_algorithm in (
    'zstd',
    'zstd-fastest',
    's2-default'
  )),
  capacity_bytes bigint not null default 0,
  logical_protected_bytes bigint not null default 0,
  stored_deduplicated_bytes bigint not null default 0,
  dedup_ratio numeric(6,2) not null default 1.00,
  online boolean not null default true,
  connected_agents_count integer not null default 0,
  total_snapshots_count integer not null default 0,
  last_sync_to_cloud_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_backup_storage_vaults_org on public.backup_storage_vaults (org_id);
create index if not exists idx_backup_storage_vaults_backend on public.backup_storage_vaults (org_id, backend_type);

-- ---------------------------------------------------------------------------
-- 2. public.backup_policies (Per-Client/Site GFS Retention, VSS/APFS/LVM & BMR Schedules)
-- ---------------------------------------------------------------------------
create table if not exists public.backup_policies (
  id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  site_id text,
  name text not null,
  enabled boolean not null default true,
  mode text not null default 'volume_snapshot_vss' check (mode in (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  target_os text not null default 'all' check (target_os in (
    'windows',
    'macos',
    'linux',
    'android',
    'ios',
    'all'
  )),
  schedule_cron text not null default '0 */4 * * *',
  schedule_label text not null default 'Every 4 hours',
  primary_vault_id text not null references public.backup_storage_vaults (id) on delete restrict,
  replicate_to_cloud_vault_id text references public.backup_storage_vaults (id) on delete set null,
  include_paths text[] not null default '{}',
  exclude_patterns text[] not null default '{}',
  enable_windows_vss boolean not null default true,
  enable_apfs_snapshot boolean not null default true,
  enable_lvm_snapshot boolean not null default true,
  capture_partition_table boolean not null default true,
  capture_efi_bootloader boolean not null default true,
  compression_algorithm text not null default 'zstd' check (compression_algorithm in (
    'zstd',
    'zstd-fastest',
    's2-default'
  )),
  bandwidth_limit_mbps integer,
  retention jsonb not null default '{
    "latest": 24,
    "hourly": 48,
    "daily": 30,
    "weekly": 12,
    "monthly": 24,
    "annual": 7
  }'::jsonb,
  immutable_lock_days integer not null default 30,
  auto_verify_weekly boolean not null default true,
  assigned_device_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_backup_policies_org_client on public.backup_policies (org_id, client_id);
create index if not exists idx_backup_policies_vault on public.backup_policies (primary_vault_id);

-- ---------------------------------------------------------------------------
-- 3. public.backup_snapshots (Immutable Kopia Manifests, VSS Metadata & File Previews)
-- ---------------------------------------------------------------------------
create table if not exists public.backup_snapshots (
  id text primary key,
  manifest_id text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  site_id text,
  device_id text not null,
  device_name text not null default '',
  os text not null default 'linux' check (os in ('windows', 'macos', 'linux', 'android', 'ios')),
  policy_id text references public.backup_policies (id) on delete set null,
  policy_name text not null default '',
  vault_id text not null references public.backup_storage_vaults (id) on delete cascade,
  vault_name text not null default '',
  mode text not null default 'volume_snapshot_vss' check (mode in (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  status text not null default 'completed' check (status in (
    'completed',
    'running',
    'verifying',
    'verified',
    'failed'
  )),
  logical_bytes bigint not null default 0,
  stored_deduplicated_bytes bigint not null default 0,
  dedup_savings_pct numeric(5,2) not null default 0.00,
  file_count integer not null default 0,
  dir_count integer not null default 0,
  vss_shadow_copy_used boolean not null default false,
  vss_shadow_copy_path text,
  partition_layout_captured boolean not null default false,
  boot_efi_captured boolean not null default false,
  replicated_to_b2 boolean not null default false,
  immutable_until timestamptz not null,
  verification_status text not null default 'pending' check (verification_status in (
    'pending',
    'verified_ok',
    'corrupted'
  )),
  sha256_root_hash text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  duration_ms integer not null default 0,
  files_preview jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_snapshots_org_client on public.backup_snapshots (org_id, client_id, completed_at desc);
create index if not exists idx_backup_snapshots_device on public.backup_snapshots (device_id, completed_at desc);
create index if not exists idx_backup_snapshots_vault on public.backup_snapshots (vault_id, status);

-- ---------------------------------------------------------------------------
-- 4. public.backup_jobs (Live Backup, Restore, Verification & B2 Sync Jobs)
-- ---------------------------------------------------------------------------
create table if not exists public.backup_jobs (
  id text primary key,
  job_number text unique not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  device_id text,
  device_name text,
  vault_id text not null references public.backup_storage_vaults (id) on delete cascade,
  vault_name text not null default '',
  policy_id text references public.backup_policies (id) on delete set null,
  job_type text not null check (job_type in (
    'backup_file_dedup',
    'backup_full_snapshot',
    'backup_bare_metal',
    'restore_files',
    'restore_bare_metal_iso',
    'verify_integrity',
    'sync_unifi_to_b2',
    'provision_b2_tenant_key'
  )),
  mode text not null default 'volume_snapshot_vss' check (mode in (
    'file_object_dedup',
    'volume_snapshot_vss',
    'bare_metal_image'
  )),
  status text not null default 'queued' check (status in (
    'queued',
    'running',
    'completed',
    'failed'
  )),
  progress_pct numeric(5,2) not null default 0.00,
  transfer_rate_mbps numeric(8,2) not null default 0.00,
  logical_bytes_processed bigint not null default 0,
  deduplicated_bytes_written bigint not null default 0,
  command_id text,
  snapshot_id text references public.backup_snapshots (id) on delete set null,
  target_restore_path text,
  recovery_pairing_code text,
  details text not null default '',
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_jobs_org_client_status on public.backup_jobs (org_id, client_id, status, started_at desc);
create index if not exists idx_backup_jobs_device on public.backup_jobs (device_id, started_at desc);
create index if not exists idx_backup_jobs_vault on public.backup_jobs (vault_id, status);

-- ---------------------------------------------------------------------------
-- 5. public.bare_metal_recovery_sessions (Bootable ISO Pairing & P2V Sessions)
-- ---------------------------------------------------------------------------
create table if not exists public.bare_metal_recovery_sessions (
  id text primary key,
  pairing_code text unique not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  source_device_id text not null,
  source_device_name text not null default '',
  source_os text not null default 'windows' check (source_os in ('windows', 'macos', 'linux', 'android', 'ios')),
  snapshot_id text not null references public.backup_snapshots (id) on delete cascade,
  manifest_id text not null,
  vault_id text not null references public.backup_storage_vaults (id) on delete cascade,
  vault_endpoint text not null,
  target_hardware_profile text not null default 'same_hardware' check (target_hardware_profile in (
    'same_hardware',
    'dissimilar_hardware_virtio',
    'proxmox_vm_p2v'
  )),
  bootloader_type text not null default 'uefi_gpt' check (bootloader_type in ('uefi_gpt', 'bios_mbr')),
  partition_layout_summary text not null default '',
  inject_virtio_drivers boolean not null default false,
  status text not null default 'awaiting_iso_boot' check (status in (
    'awaiting_iso_boot',
    'iso_paired',
    'partitioning_disks',
    'streaming_dedup_blocks',
    'repairing_bootloader',
    'completed',
    'expired'
  )),
  progress_pct numeric(5,2) not null default 0.00,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bmr_sessions_org_client on public.bare_metal_recovery_sessions (org_id, client_id, status);
create index if not exists idx_bmr_sessions_device on public.bare_metal_recovery_sessions (source_device_id);
create index if not exists idx_bmr_sessions_vault on public.bare_metal_recovery_sessions (vault_id);

-- ---------------------------------------------------------------------------
-- 6. public.device_backup_reports (Endpoint Kopia Agent Telemetry & VSS/APFS/LVM Readiness)
-- ---------------------------------------------------------------------------
create table if not exists public.device_backup_reports (
  device_id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null default '',
  kopia_installed boolean not null default false,
  kopia_version text not null default '',
  kopia_binary_path text not null default '',
  kopia_sha256_verified boolean not null default false,
  repository_connected boolean not null default false,
  vault_endpoint text not null default '',
  append_only_mode boolean not null default true,
  vss_available boolean not null default false,
  apfs_snapshot_available boolean not null default false,
  lvm_snapshot_available boolean not null default false,
  last_snapshot_id text,
  last_snapshot_at timestamptz,
  logical_bytes_total bigint not null default 0,
  deduplicated_bytes_total bigint not null default 0,
  dedup_ratio numeric(6,2) not null default 1.00,
  active_job_id text,
  status text not null default 'unconfigured' check (status in (
    'idle',
    'running_backup',
    'running_restore',
    'verifying',
    'error',
    'unconfigured'
  )),
  last_error text,
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_backup_reports_org_client on public.device_backup_reports (org_id, client_id);
create index if not exists idx_device_backup_reports_status on public.device_backup_reports (org_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.backup_storage_vaults enable row level security;
alter table public.backup_policies enable row level security;
alter table public.backup_snapshots enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.bare_metal_recovery_sessions enable row level security;
alter table public.device_backup_reports enable row level security;

create policy backup_storage_vaults_tenant_access on public.backup_storage_vaults
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy backup_policies_tenant_access on public.backup_policies
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy backup_snapshots_tenant_access on public.backup_snapshots
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy backup_jobs_tenant_access on public.backup_jobs
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy bare_metal_recovery_sessions_tenant_access on public.bare_metal_recovery_sessions
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy device_backup_reports_tenant_access on public.device_backup_reports
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

-- ---------------------------------------------------------------------------
-- MANDATORY SUPABASE OCT 30 EXPLICIT GRANTS (TKT-2026-1001)
-- Every new table/sequence/function in public schema MUST have explicit GRANTs
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
