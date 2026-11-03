-- Supabase Migration 0005: Supabase Auth, 2FA/MFA Step-Up Session Grants & Zero-Linter RLS Hardening
-- Enforces NodalCortex Brain Rule `rule_supabase_rls_linter_zero`:
--   1. Every public table has ENABLE ROW LEVEL SECURITY with explicit `authenticated` and `service_role` policies.
--   2. Broad `SELECT, INSERT, UPDATE, DELETE` privileges are revoked from `anon` on all sensitive tables.
--   3. All public functions explicitly set `SET search_path = public, pg_temp`.
--   4. All public views (if any) use `WITH (security_invoker = true)`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Harden Function `search_path` (`rule_supabase_rls_linter_zero`)
-- ---------------------------------------------------------------------------
alter function public.current_user_id() set search_path = public, pg_temp;
alter function public.is_org_member(uuid, public.org_member_role) set search_path = public, pg_temp;
alter function public.is_platform_admin(public.platform_admin_role) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.enforce_job_org_alignment() set search_path = public, pg_temp;
alter function public.audit_row_change() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Operator MFA Challenges (`public.operator_mfa_challenges`)
-- ---------------------------------------------------------------------------
create table if not exists public.operator_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  operator_user_id uuid not null references auth.users (id) on delete cascade,
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

-- ---------------------------------------------------------------------------
-- 3. Remote Session Grants (`public.remote_session_grants`)
-- ---------------------------------------------------------------------------
create table if not exists public.remote_session_grants (
  id uuid primary key default gen_random_uuid(),
  grant_jti text unique not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id text not null,
  device_id text not null,
  device_name text not null,
  operator_user_id uuid not null references auth.users (id) on delete cascade,
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

-- ---------------------------------------------------------------------------
-- 4. Remote Session Immutable Audit Logs (`public.remote_session_audit_logs`)
-- ---------------------------------------------------------------------------
create table if not exists public.remote_session_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  grant_id uuid references public.remote_session_grants (id) on delete set null,
  device_id text not null,
  operator_user_id uuid references auth.users (id) on delete set null,
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

-- ---------------------------------------------------------------------------
-- 5. Enable Row Level Security (RLS) & Policies on New Auth/MFA Tables
-- ---------------------------------------------------------------------------
alter table public.operator_mfa_challenges enable row level security;
alter table public.remote_session_grants enable row level security;
alter table public.remote_session_audit_logs enable row level security;

drop policy if exists operator_mfa_challenges_tenant_access on public.operator_mfa_challenges;
create policy operator_mfa_challenges_tenant_access on public.operator_mfa_challenges
  for all to authenticated
  using (
    operator_user_id = public.current_user_id()
    or public.is_org_member(org_id, 'admin')
    or public.is_platform_admin('readonly')
  )
  with check (
    operator_user_id = public.current_user_id()
    or public.is_org_member(org_id, 'admin')
    or public.is_platform_admin('support')
  );

drop policy if exists remote_session_grants_tenant_access on public.remote_session_grants;
create policy remote_session_grants_tenant_access on public.remote_session_grants
  for all to authenticated
  using (
    public.is_org_member(org_id, 'crew')
    or public.is_platform_admin('readonly')
  )
  with check (
    public.is_org_member(org_id, 'crew')
    or public.is_platform_admin('support')
  );

drop policy if exists remote_session_audit_logs_select on public.remote_session_audit_logs;
create policy remote_session_audit_logs_select on public.remote_session_audit_logs
  for select to authenticated
  using (
    public.is_org_member(org_id, 'admin')
    or public.is_platform_admin('readonly')
  );

drop policy if exists remote_session_audit_logs_insert on public.remote_session_audit_logs;
create policy remote_session_audit_logs_insert on public.remote_session_audit_logs
  for insert to authenticated
  with check (
    public.is_org_member(org_id, 'crew')
    or public.is_platform_admin('support')
  );

-- ---------------------------------------------------------------------------
-- 6. Revoke Broad `anon` Table Privileges & Grant Strictly to `authenticated` & `service_role`
--    (`rule_supabase_rls_linter_zero`)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke all on sequences from anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
