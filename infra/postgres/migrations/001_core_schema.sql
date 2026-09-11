-- OpenMSP Core Schema Migration 001
-- Multi-tenant MSP schema: msp_orgs -> clients -> sites -> devices

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'tech', 'readonly');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_os') THEN
    CREATE TYPE device_os AS ENUM ('windows', 'macos', 'linux', 'network');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_health') THEN
    CREATE TYPE device_health AS ENUM ('healthy', 'warning', 'critical', 'offline');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'command_status') THEN
    CREATE TYPE command_status AS ENUM ('pending', 'dispatched', 'running', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM ('new', 'in_progress', 'waiting_on_client', 'resolved', 'closed');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Organizations & Members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS msp_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  settings JSONB NOT NULL DEFAULT '{
    "companyName": "ApexMSP",
    "logoUrl": "",
    "primaryColor": "#2563eb",
    "secondaryColor": "#0f172a",
    "accentColor": "#10b981",
    "darkMode": true,
    "customDomain": "portal.apexmsp.io",
    "supportEmail": "support@apexmsp.io",
    "portalWelcomeMessage": "Welcome to the ApexMSP Support Portal"
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'tech',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Clients & Sites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  active_contract TEXT NOT NULL DEFAULT 'Standard Managed Care',
  monthly_sla_tier TEXT NOT NULL DEFAULT 'Silver 8/5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Devices & Telemetry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  os device_os NOT NULL DEFAULT 'windows',
  os_version TEXT NOT NULL DEFAULT '',
  arch TEXT NOT NULL DEFAULT 'amd64',
  serial_number TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  public_ip TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  health device_health NOT NULL DEFAULT 'healthy',
  device_secret TEXT NOT NULL,
  rustdesk_id TEXT NOT NULL DEFAULT '',
  rustdesk_online BOOLEAN NOT NULL DEFAULT false,
  mdm_enrolled BOOLEAN NOT NULL DEFAULT false,
  encryption_status TEXT NOT NULL DEFAULT 'pending',
  encryption_key TEXT,
  patch_compliance NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cpu_usage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ram_usage NUMERIC(5,2) NOT NULL DEFAULT 0,
  disk_usage NUMERIC(5,2) NOT NULL DEFAULT 0,
  uptime_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  network JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_apps JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status command_status NOT NULL DEFAULT 'pending',
  output TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS enrollment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PSA Ticketing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  ticket_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'new',
  category TEXT NOT NULL DEFAULT 'Software',
  assigned_tech TEXT NOT NULL DEFAULT 'Unassigned',
  sla_due_date TIMESTAMPTZ NOT NULL,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  ai_suggested_fix TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'tech',
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  billable BOOLEAN NOT NULL DEFAULT true,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Automations & Patches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS self_healing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  os_target TEXT NOT NULL DEFAULT 'all',
  trigger_type TEXT NOT NULL,
  trigger_threshold NUMERIC(5,2),
  target_service_name TEXT,
  action_type TEXT NOT NULL,
  script_content TEXT,
  last_executed TIMESTAMPTZ,
  executions_count INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES self_healing_rules(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success',
  details TEXT NOT NULL DEFAULT '',
  is_dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  kb_article TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'important',
  category TEXT NOT NULL DEFAULT 'Security',
  target_os device_os NOT NULL DEFAULT 'windows',
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  patch_id UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  installed_at TIMESTAMPTZ,
  UNIQUE(device_id, patch_id)
);

-- ---------------------------------------------------------------------------
-- Audit Log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES msp_orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_devices_org_client ON devices(org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_devices_health ON devices(health);
CREATE INDEX IF NOT EXISTS idx_heartbeats_device_created ON device_heartbeats(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_device_status ON device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_org_client ON tickets(org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(org_id, created_at DESC);
