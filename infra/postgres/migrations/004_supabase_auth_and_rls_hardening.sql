-- Postgres Migration 004: Supabase Auth, 2FA/MFA Step-Up Session Grants & Zero-Linter RLS Hardening
-- Enforces NodalCortex Brain Rule `rule_supabase_rls_linter_zero`

create extension if not exists pgcrypto;

create table if not exists public.operator_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  operator_user_id uuid not null,
  operator_email text not null,
  device_id text not null,
  session_mode text not null check (session_mode in (
    'interactive_desktop',
    'backstage_shell',
    'backstage_powershell',
    'file_transfer',
    'elevation_prompt'
  )),
  factor_type text not null check (factor_type in ('totp', 'webauthn', 'duress_pin')),
  supabase_factor_id text,
  challenge_status text not null default 'pending' check (challenge_status in (
    'pending',
    'verified',
    'failed',
    'duress_triggered',
    'expired'
  )),
  source_ip text,
  user_agent text,
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists idx_operator_mfa_challenges_org_user
  on public.operator_mfa_challenges (org_id, operator_user_id, created_at desc);

create table if not exists public.remote_session_grants (
  id uuid primary key default gen_random_uuid(),
  grant_jti text unique not null,
  org_id uuid not null,
  client_id text not null,
  device_id text not null,
  device_name text not null,
  operator_user_id uuid not null,
  operator_email text not null,
  mfa_challenge_id uuid references public.operator_mfa_challenges (id) on delete set null,
  aal_level text not null check (aal_level in ('aal2')),
  session_mode text not null,
  reason text not null default 'Routine maintenance / ticket resolution',
  ticket_id text,
  requires_end_user_consent boolean not null default false,
  end_user_consent_status text not null default 'not_required' check (end_user_consent_status in (
    'not_required',
    'pending_user_prompt',
    'approved_by_user',
    'denied_by_user',
    'timed_out'
  )),
  status text not null default 'active' check (status in (
    'active',
    'connected',
    'terminated',
    'revoked_by_soc',
    'expired'
  )),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  terminated_at timestamptz
);

create index if not exists idx_remote_session_grants_org_device
  on public.remote_session_grants (org_id, device_id, issued_at desc);

create table if not exists public.remote_session_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  grant_id uuid references public.remote_session_grants (id) on delete set null,
  device_id text not null,
  operator_user_id uuid,
  operator_email text not null,
  event_type text not null check (event_type in (
    'mfa_challenge_issued',
    'mfa_challenge_verified',
    'mfa_challenge_failed',
    'duress_alert_triggered',
    'session_grant_minted',
    'mesh_tunnel_connected',
    'command_executed',
    'file_uploaded',
    'file_downloaded',
    'session_terminated'
  )),
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  source_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_remote_session_audit_logs_org_created
  on public.remote_session_audit_logs (org_id, created_at desc);

alter table public.operator_mfa_challenges enable row level security;
alter table public.remote_session_grants enable row level security;
alter table public.remote_session_audit_logs enable row level security;
