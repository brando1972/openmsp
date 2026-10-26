-- Supabase Migration 0003: SIEM, EDR, AV, UniFi SOC & Temporal Identity Graph
-- Enforces Mandatory Supabase Oct 30 Explicit GRANT Rule (TKT-2026-1001) + RLS

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Security Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'security_severity') then
    create type public.security_severity as enum ('info', 'low', 'medium', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'security_category') then
    create type public.security_category as enum (
      'malware',
      'ransomware',
      'recovery_inhibition',
      'persistence',
      'canary_tripwire',
      'lateral_movement',
      'network_ids',
      'unifi_anomaly',
      'wifi_diagnostic',
      'av_tamper',
      'policy_violation'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'security_coverage_state') then
    create type public.security_coverage_state as enum (
      'unknown',
      'installed',
      'healthy',
      'collecting',
      'preventive_active',
      'containment_requested',
      'containment_verified',
      'degraded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'security_incident_status') then
    create type public.security_incident_status as enum (
      'open',
      'investigating',
      'containment_pending',
      'contained',
      'resolved',
      'false_positive'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'security_action_status') then
    create type public.security_action_status as enum (
      'pending_approval',
      'approved',
      'rejected',
      'executing',
      'verified',
      'failed',
      'expired',
      'blocked_protected_asset'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. public.security_devices
-- ---------------------------------------------------------------------------
create table if not exists public.security_devices (
  device_id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  site_id text,
  coverage_state public.security_coverage_state not null default 'unknown',
  preventive_av_name text not null default 'unknown',
  preventive_av_active boolean not null default false,
  realtime_protection_enabled boolean not null default false,
  tamper_protection_enabled boolean not null default false,
  canary_files_deployed boolean not null default false,
  canary_paths text[] not null default '{}',
  recovery_inhibition_guard boolean not null default true,
  isolated boolean not null default false,
  isolation_state text not null default 'normal',
  sensor_versions jsonb not null default '[]'::jsonb,
  sensors jsonb not null default '[]'::jsonb,
  scanner_memory_mb numeric(8,2) default 0,
  supervisor_cpu_pct numeric(5,2) default 0,
  telemetry_cpu_pct numeric(5,2) default 0,
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_devices_org_client on public.security_devices (org_id, client_id);

-- ---------------------------------------------------------------------------
-- 2. public.provider_identity_observations
-- ---------------------------------------------------------------------------
create table if not exists public.provider_identity_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  site_id text not null,
  provider text not null check (provider in (
    'unifi_local_api',
    'unifi_cloud_sitemanager',
    'unifi_syslog',
    'apex_agent',
    'pos_sdk_verified'
  )),
  provider_client_id text not null,
  mac_address text not null,
  ip_address text,
  hostname text,
  alias text,
  device_role text not null default 'unknown',
  serial_number text,
  is_wired boolean not null default false,
  switch_id text,
  switch_name text,
  switch_mac text,
  switch_port integer,
  attachment_type text not null default 'inferred' check (attachment_type in (
    'confirmed_direct',
    'shared_uplink_or_hub',
    'wireless_ap',
    'inferred'
  )),
  port_mac_count integer not null default 1,
  ap_id text,
  ap_name text,
  ssid text,
  vlan_id integer,
  network_name text,
  rssi integer,
  dhcp_reserved boolean not null default false,
  is_protected_asset boolean not null default false,
  confidence numeric(4,3) not null default 0.800 check (confidence >= 0.0 and confidence <= 1.0),
  evidence_source text not null default 'poll',
  observed_from timestamptz not null default now(),
  observed_to timestamptz not null default now(),
  managed_device_id text,
  created_at timestamptz not null default now(),
  constraint chk_temporal_observation_window check (observed_to >= observed_from)
);

create index if not exists idx_pio_org_client_site on public.provider_identity_observations (org_id, client_id, site_id);
create index if not exists idx_pio_tenant_mac_window on public.provider_identity_observations (org_id, client_id, mac_address, observed_from desc, observed_to desc);
create index if not exists idx_pio_tenant_ip_window on public.provider_identity_observations (org_id, client_id, ip_address, observed_from desc, observed_to desc);

-- ---------------------------------------------------------------------------
-- 3. public.security_detections
-- ---------------------------------------------------------------------------
create table if not exists public.security_detections (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  idempotency_key text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null default '',
  site_id text,
  device_id text,
  device_name text,
  event_time timestamptz not null default now(),
  ingest_time timestamptz not null default now(),
  source_provider text not null check (source_provider in (
    'apex_agent',
    'wazuh',
    'velociraptor',
    'clamav',
    'yara_x',
    'osquery',
    'unifi_ids',
    'unifi_syslog',
    'unifi_flow'
  )),
  rule_id text not null,
  rule_name text not null,
  severity public.security_severity not null default 'medium',
  confidence numeric(4,3) not null default 0.800 check (confidence >= 0.0 and confidence <= 1.0),
  category public.security_category not null,
  summary text not null,
  process_context jsonb not null default '{}'::jsonb,
  file_context jsonb not null default '{}'::jsonb,
  network_context jsonb not null default '{}'::jsonb,
  raw_evidence jsonb not null default '{}'::jsonb,
  is_benign_simulation boolean not null default false,
  incident_id text,
  evidence_pointer text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key),
  unique (org_id, event_id)
);

create index if not exists idx_sec_detections_org_client_time on public.security_detections (org_id, client_id, event_time desc);
create index if not exists idx_sec_detections_incident on public.security_detections (incident_id);

-- ---------------------------------------------------------------------------
-- 4. public.security_incidents
-- ---------------------------------------------------------------------------
create table if not exists public.security_incidents (
  id text primary key,
  incident_number text unique not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null,
  site_id text,
  site_name text,
  device_id text,
  device_name text,
  title text not null,
  summary text not null,
  severity public.security_severity not null default 'high',
  category public.security_category not null,
  status public.security_incident_status not null default 'open',
  confidence numeric(4,3) not null default 0.850,
  detection_ids text[] not null default '{}',
  ticket_id text,
  copilot_case_url text,
  velociraptor_hunt_id text,
  wazuh_alert_ids text[] not null default '{}',
  asset_criticality text not null default 'standard' check (asset_criticality in (
    'standard',
    'pos_payment',
    'pos_controller',
    'infrastructure',
    'municipal_critical',
    'protected_never_auto_isolate'
  )),
  containment_state text not null default 'none' check (containment_state in (
    'none',
    'requested',
    'approved',
    'executing',
    'verified',
    'failed',
    'manual_required'
  )),
  first_event_time timestamptz not null default now(),
  last_event_time timestamptz not null default now(),
  ingest_latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sec_incidents_org_client_status on public.security_incidents (org_id, client_id, status);

-- ---------------------------------------------------------------------------
-- 5. public.security_policies
-- ---------------------------------------------------------------------------
create table if not exists public.security_policies (
  id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null,
  site_id text,
  policy_version text not null default 'v2026.10.1',
  mode text not null default 'active_detect' check (mode in ('learning', 'active_detect', 'auto_contain_safe')),
  edr_reflex_enabled boolean not null default true,
  recovery_inhibition_auto_kill boolean not null default true,
  canary_tripwire_enabled boolean not null default true,
  canary_paths text[] not null default '{}',
  av_realtime_enabled boolean not null default true,
  av_scan_cadence_hours integer not null default 24,
  unifi_ids_correlation_enabled boolean not null default true,
  auto_isolate_workstations_on_critical boolean not null default false,
  protected_asset_exclusions jsonb not null default '{
    "neverAutoIsolateRoles": ["pos_payment_pax", "pos_controller_candidate", "pos_terminal", "pos_printer", "server", "gateway", "switch", "ap"],
    "neverBlockSharedSwitchPorts": true,
    "protectedMacAddresses": [],
    "protectedIpAddresses": [],
    "protectedSwitchPorts": []
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, client_id, site_id)
);

-- ---------------------------------------------------------------------------
-- 6. public.security_actions & public.security_approvals
-- ---------------------------------------------------------------------------
create table if not exists public.security_actions (
  id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  client_name text not null,
  site_id text,
  incident_id text references public.security_incidents (id) on delete set null,
  target_device_id text,
  target_device_name text,
  target_unifi_client_mac text,
  action_type text not null check (action_type in (
    'kill_process',
    'quarantine_file',
    'restore_quarantined_file',
    'isolate_host',
    'unisolate_host',
    'unifi_block_client',
    'unifi_unblock_client',
    'velociraptor_collect_artifact',
    'run_yara_scan',
    'run_clamav_scan'
  )),
  reason text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  requires_human_approval boolean not null default true,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  expires_at timestamptz not null,
  policy_version text not null default 'v2026.10.1',
  status public.security_action_status not null default 'pending_approval',
  payload jsonb not null default '{}'::jsonb,
  actual_result text,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_sec_actions_org_status on public.security_actions (org_id, status, requested_at desc);

create table if not exists public.security_approvals (
  id uuid primary key default gen_random_uuid(),
  action_id text not null references public.security_actions (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  actor_id text,
  actor_name text not null,
  actor_role text not null default 'admin',
  policy_version text not null,
  notes text,
  decided_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. public.security_outbox & public.connector_cursors
-- ---------------------------------------------------------------------------
create table if not exists public.security_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  destination text not null check (destination in (
    'psa_ticket',
    'websocket_soc',
    'pager_webhook',
    'wazuh_active_response',
    'velociraptor_hunt',
    'unifi_controller'
  )),
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  dispatched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, dedupe_key)
);

create table if not exists public.connector_cursors (
  connector_id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  site_id text,
  provider text not null,
  cursor_value text not null default '',
  parser_version text not null default 'unifi-cef-v1.2',
  last_polled_at timestamptz not null default now(),
  last_status text not null default 'ok',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.security_devices enable row level security;
alter table public.provider_identity_observations enable row level security;
alter table public.security_detections enable row level security;
alter table public.security_incidents enable row level security;
alter table public.security_policies enable row level security;
alter table public.security_actions enable row level security;
alter table public.security_approvals enable row level security;
alter table public.security_outbox enable row level security;
alter table public.connector_cursors enable row level security;

create policy security_devices_tenant_access on public.security_devices
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy pio_tenant_access on public.provider_identity_observations
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy security_detections_tenant_access on public.security_detections
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy security_incidents_tenant_access on public.security_incidents
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy security_policies_tenant_access on public.security_policies
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy security_actions_tenant_access on public.security_actions
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy security_approvals_tenant_access on public.security_approvals
  for all to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy security_outbox_tenant_access on public.security_outbox
  for all to authenticated
  using (public.is_org_member(org_id, 'admin') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy connector_cursors_tenant_access on public.connector_cursors
  for all to authenticated
  using (public.is_org_member(org_id, 'admin') or public.is_platform_admin('readonly'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

-- ---------------------------------------------------------------------------
-- MANDATORY SUPABASE OCT 30 EXPLICIT GRANTS (TKT-2026-1001)
-- Every new table/sequence/function in public schema MUST have explicit GRANTs
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_devices TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_identity_observations TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_detections TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_incidents TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_policies TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_actions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_approvals TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_outbox TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_cursors TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
