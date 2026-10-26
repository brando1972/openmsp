-- OpenMSP / ApexMSP Security SIEM, EDR, AV & UniFi SOC Schema Migration 002
-- Enforces Mandatory Supabase Oct 30 Explicit GRANT Rule (TKT-2026-1001)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

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
-- Security Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_severity') THEN
    CREATE TYPE public.security_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_category') THEN
    CREATE TYPE public.security_category AS ENUM (
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
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_coverage_state') THEN
    CREATE TYPE public.security_coverage_state AS ENUM (
      'unknown',
      'installed',
      'healthy',
      'collecting',
      'preventive_active',
      'containment_requested',
      'containment_verified',
      'degraded'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_incident_status') THEN
    CREATE TYPE public.security_incident_status AS ENUM (
      'open',
      'investigating',
      'containment_pending',
      'contained',
      'resolved',
      'false_positive'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_action_status') THEN
    CREATE TYPE public.security_action_status AS ENUM (
      'pending_approval',
      'approved',
      'rejected',
      'executing',
      'verified',
      'failed',
      'expired',
      'blocked_protected_asset'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. security_devices (Endpoint Security Posture, AV, Canary & Sensor State)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_devices (
  device_id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  site_id TEXT,
  coverage_state public.security_coverage_state NOT NULL DEFAULT 'unknown',
  preventive_av_name TEXT NOT NULL DEFAULT 'unknown',
  preventive_av_active BOOLEAN NOT NULL DEFAULT false,
  realtime_protection_enabled BOOLEAN NOT NULL DEFAULT false,
  tamper_protection_enabled BOOLEAN NOT NULL DEFAULT false,
  canary_files_deployed BOOLEAN NOT NULL DEFAULT false,
  canary_paths TEXT[] NOT NULL DEFAULT '{}',
  recovery_inhibition_guard BOOLEAN NOT NULL DEFAULT true,
  isolated BOOLEAN NOT NULL DEFAULT false,
  isolation_state TEXT NOT NULL DEFAULT 'normal',
  sensor_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sensors JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanner_memory_mb NUMERIC(8,2) DEFAULT 0,
  supervisor_cpu_pct NUMERIC(5,2) DEFAULT 0,
  telemetry_cpu_pct NUMERIC(5,2) DEFAULT 0,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_devices_org_client ON public.security_devices(org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_security_devices_coverage ON public.security_devices(coverage_state);

-- ---------------------------------------------------------------------------
-- 2. provider_identity_observations (Bi-Temporal Network & Identity Graph)
--    Prevents cross-tenant IP/MAC collisions and DHCP lease-reuse misattribution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_identity_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN (
    'unifi_local_api',
    'unifi_cloud_sitemanager',
    'unifi_syslog',
    'apex_agent',
    'pos_sdk_verified'
  )),
  provider_client_id TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  ip_address TEXT,
  hostname TEXT,
  alias TEXT,
  device_role TEXT NOT NULL DEFAULT 'unknown',
  serial_number TEXT,
  is_wired BOOLEAN NOT NULL DEFAULT false,
  switch_id TEXT,
  switch_name TEXT,
  switch_mac TEXT,
  switch_port INTEGER,
  attachment_type TEXT NOT NULL DEFAULT 'inferred' CHECK (attachment_type IN (
    'confirmed_direct',
    'shared_uplink_or_hub',
    'wireless_ap',
    'inferred'
  )),
  port_mac_count INTEGER NOT NULL DEFAULT 1,
  ap_id TEXT,
  ap_name TEXT,
  ssid TEXT,
  vlan_id INTEGER,
  network_name TEXT,
  rssi INTEGER,
  dhcp_reserved BOOLEAN NOT NULL DEFAULT false,
  is_protected_asset BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.800 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_source TEXT NOT NULL DEFAULT 'poll',
  observed_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_to TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  managed_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_temporal_observation_window CHECK (observed_to >= observed_from)
);

CREATE INDEX IF NOT EXISTS idx_pio_org_client_site ON public.provider_identity_observations(org_id, client_id, site_id);
CREATE INDEX IF NOT EXISTS idx_pio_tenant_mac_window ON public.provider_identity_observations(org_id, client_id, mac_address, observed_from DESC, observed_to DESC);
CREATE INDEX IF NOT EXISTS idx_pio_tenant_ip_window ON public.provider_identity_observations(org_id, client_id, ip_address, observed_from DESC, observed_to DESC);
CREATE INDEX IF NOT EXISTS idx_pio_switch_port ON public.provider_identity_observations(site_id, switch_id, switch_port);

-- ---------------------------------------------------------------------------
-- 3. security_detections (Idempotent Normalized SIEM/EDR/AV/UniFi Events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  device_id TEXT,
  device_name TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingest_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_provider TEXT NOT NULL CHECK (source_provider IN (
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
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  severity public.security_severity NOT NULL DEFAULT 'medium',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.800 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  category public.security_category NOT NULL,
  summary TEXT NOT NULL,
  process_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_benign_simulation BOOLEAN NOT NULL DEFAULT false,
  incident_id TEXT,
  evidence_pointer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_sec_detections_org_client_time ON public.security_detections(org_id, client_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_sec_detections_device_time ON public.security_detections(device_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_sec_detections_incident ON public.security_detections(incident_id);
CREATE INDEX IF NOT EXISTS idx_sec_detections_severity ON public.security_detections(severity, ingest_time DESC);

-- ---------------------------------------------------------------------------
-- 4. security_incidents (Correlated SOC Cases, PSA Ticket Sync & Latency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id TEXT PRIMARY KEY,
  incident_number TEXT UNIQUE NOT NULL,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  site_id TEXT,
  site_name TEXT,
  device_id TEXT,
  device_name TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity public.security_severity NOT NULL DEFAULT 'high',
  category public.security_category NOT NULL,
  status public.security_incident_status NOT NULL DEFAULT 'open',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.850,
  detection_ids TEXT[] NOT NULL DEFAULT '{}',
  ticket_id TEXT,
  copilot_case_url TEXT,
  velociraptor_hunt_id TEXT,
  wazuh_alert_ids TEXT[] NOT NULL DEFAULT '{}',
  asset_criticality TEXT NOT NULL DEFAULT 'standard' CHECK (asset_criticality IN (
    'standard',
    'pos_payment',
    'pos_controller',
    'infrastructure',
    'municipal_critical',
    'protected_never_auto_isolate'
  )),
  containment_state TEXT NOT NULL DEFAULT 'none' CHECK (containment_state IN (
    'none',
    'requested',
    'approved',
    'executing',
    'verified',
    'failed',
    'manual_required'
  )),
  first_event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingest_latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_incidents_org_client_status ON public.security_incidents(org_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_sec_incidents_severity ON public.security_incidents(severity, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 5. security_policies (Per-Client/Site EDR/AV/UniFi Policy & Safety Exclusions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_policies (
  id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  site_id TEXT,
  policy_version TEXT NOT NULL DEFAULT 'v2026.10.1',
  mode TEXT NOT NULL DEFAULT 'active_detect' CHECK (mode IN ('learning', 'active_detect', 'auto_contain_safe')),
  edr_reflex_enabled BOOLEAN NOT NULL DEFAULT true,
  recovery_inhibition_auto_kill BOOLEAN NOT NULL DEFAULT true,
  canary_tripwire_enabled BOOLEAN NOT NULL DEFAULT true,
  canary_paths TEXT[] NOT NULL DEFAULT '{}',
  av_realtime_enabled BOOLEAN NOT NULL DEFAULT true,
  av_scan_cadence_hours INTEGER NOT NULL DEFAULT 24,
  unifi_ids_correlation_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_isolate_workstations_on_critical BOOLEAN NOT NULL DEFAULT false,
  protected_asset_exclusions JSONB NOT NULL DEFAULT '{
    "neverAutoIsolateRoles": ["pos_payment_pax", "pos_controller_candidate", "pos_terminal", "pos_printer", "server", "gateway", "switch", "ap"],
    "neverBlockSharedSwitchPorts": true,
    "protectedMacAddresses": [],
    "protectedIpAddresses": [],
    "protectedSwitchPorts": []
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, client_id, site_id)
);

-- ---------------------------------------------------------------------------
-- 6. security_actions & security_approvals (Audited Action Broker & Safety Lock)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_actions (
  id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  site_id TEXT,
  incident_id TEXT REFERENCES public.security_incidents(id) ON DELETE SET NULL,
  target_device_id TEXT,
  target_device_name TEXT,
  target_unifi_client_mac TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN (
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
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requires_human_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'v2026.10.1',
  status public.security_action_status NOT NULL DEFAULT 'pending_approval',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_result TEXT,
  error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_actions_org_status ON public.security_actions(org_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_actions_incident ON public.security_actions(incident_id);

CREATE TABLE IF NOT EXISTS public.security_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL REFERENCES public.security_actions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'admin',
  policy_version TEXT NOT NULL,
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_approvals_action ON public.security_approvals(action_id);

-- ---------------------------------------------------------------------------
-- 7. security_outbox & connector_cursors (Transactional Outbox & Poll Cursors)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN (
    'psa_ticket',
    'websocket_soc',
    'pager_webhook',
    'wazuh_active_response',
    'velociraptor_hunt',
    'unifi_controller'
  )),
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_sec_outbox_pending ON public.security_outbox(status, next_attempt_at ASC);

CREATE TABLE IF NOT EXISTS public.connector_cursors (
  connector_id TEXT PRIMARY KEY,
  org_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  site_id TEXT,
  provider TEXT NOT NULL,
  cursor_value TEXT NOT NULL DEFAULT '',
  parser_version TEXT NOT NULL DEFAULT 'unifi-cef-v1.2',
  last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status TEXT NOT NULL DEFAULT 'ok',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- MANDATORY SUPABASE OCT 30 EXPLICIT GRANTS (TKT-2026-1001)
-- Explicit table, sequence, and default privilege grants for PostgREST roles
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
