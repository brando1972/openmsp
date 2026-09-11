-- LawnCrew multi-tenant core
-- Tenants = organizations. Every business row has org_id.
-- Global backend staff = platform_admins (owner / support / readonly).
-- Org staff = org_members (owner / admin / dispatcher / crew / accountant / marketing).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type org_role as enum ('owner', 'admin', 'dispatcher', 'crew', 'accountant', 'marketing');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type platform_role as enum ('owner', 'support', 'readonly');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'org_status') then
    create type org_status as enum ('active', 'suspended', 'deleted');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Identity + tenancy
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role platform_role not null default 'support',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status org_status not null default 'active',
  logo_url text,
  theme jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role org_role not null default 'crew',
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_id_idx on public.org_members (user_id);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role org_role not null default 'crew',
  invited_by uuid references public.profiles (id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  org_id uuid references public.organizations (id) on delete set null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx on public.platform_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.org_role_rank(r org_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner' then 60
    when 'admin' then 50
    when 'dispatcher' then 40
    when 'accountant' then 30
    when 'marketing' then 20
    when 'crew' then 10
  end;
$$;

create or replace function public.platform_role_rank(r platform_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner' then 30
    when 'support' then 20
    when 'readonly' then 10
  end;
$$;

create or replace function public.is_platform_admin(min_role text default 'readonly')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and public.platform_role_rank(pa.role) >= public.platform_role_rank(min_role::platform_role)
  );
$$;

create or replace function public.is_org_member(_org_id uuid, _min_role org_role default 'crew')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and public.org_role_rank(m.role) >= public.org_role_rank(_min_role)
  );
$$;

create or replace function public.shares_org_with(_other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members me
    join public.org_members them on me.org_id = them.org_id
    where me.user_id = auth.uid()
      and them.user_id = _other_user
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_organization(_name text, _slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(_name), '') = '' then
    raise exception 'organization name is required';
  end if;
  if coalesce(trim(_slug), '') = '' then
    raise exception 'organization slug is required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(_name), lower(trim(_slug)), auth.uid())
  returning * into org;

  insert into public.org_members (org_id, user_id, role, invited_by)
  values (org.id, auth.uid(), 'owner', auth.uid());

  return org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lawn operations (all tenant-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  cell text,
  category text not null default 'Residential',
  sales_rep text,
  referred_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_org_id_idx on public.customers (org_id);

create table if not exists public.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text not null,
  billing_type text not null default 'Personal',
  company_name text,
  billing_address text,
  billing_city text,
  billing_state text,
  billing_zip text,
  email text,
  phone text,
  payment_method text not null default 'Invoice',
  card_brand text,
  card_last4 text,
  tax_exempt boolean not null default false,
  tax_id text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_profiles_org_customer_idx on public.billing_profiles (org_id, customer_id);

create table if not exists public.job_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null,
  property_type text not null default 'Residential',
  address text not null,
  city text,
  state text,
  zip text,
  county text,
  cross_street text,
  lat double precision,
  lng double precision,
  turf_sq_ft numeric,
  grass_type text,
  mow_frequency text,
  cut_height_inches numeric,
  gate_code text,
  hazards text,
  dogs_on_site boolean not null default false,
  leed_project boolean not null default false,
  default_billing_profile_id uuid references public.billing_profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_sites_org_customer_idx on public.job_sites (org_id, customer_id);

create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text,
  charge_unit text not null default 'flat',
  unit_label text,
  default_rate numeric not null default 0,
  estimated_minutes int,
  required_equipment text,
  default_material text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_types_org_id_idx on public.service_types (org_id);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  asset_number text not null,
  type text,
  status text not null default 'Available',
  location text,
  address text,
  days_out int not null default 0,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  specs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, asset_number)
);

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type text,
  address text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  hours text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crew_profiles (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  vehicle text,
  status text not null default 'Available',
  current_lat double precision,
  current_lng double precision,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  wo_number text not null,
  customer_id uuid references public.customers (id) on delete set null,
  job_site_id uuid references public.job_sites (id) on delete set null,
  billing_profile_id uuid references public.billing_profiles (id) on delete set null,
  service_type_id uuid references public.service_types (id) on delete set null,
  technician_id uuid references public.profiles (id) on delete set null,
  status text not null default 'scheduled',
  service_type_name text,
  job_name text,
  date date,
  sequence_num int,
  lat double precision,
  lng double precision,
  notes text,
  hazards text,
  total_amount numeric not null default 0,
  balance_due numeric not null default 0,
  is_paid_in_full boolean not null default false,
  payment_method text,
  field_checklist jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, wo_number)
);

create index if not exists work_orders_org_date_idx on public.work_orders (org_id, date);
create index if not exists work_orders_org_tech_idx on public.work_orders (org_id, technician_id);

create table if not exists public.work_order_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text,
  message text not null,
  type text not null default 'status',
  created_at timestamptz not null default now()
);

create index if not exists work_order_logs_wo_idx on public.work_order_logs (work_order_id, created_at desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_number text not null,
  work_order_id uuid references public.work_orders (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'Draft',
  date_created date,
  date_completed date,
  due_date date,
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  balance_due numeric not null default 0,
  payment_method text,
  payment_date date,
  warning_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);

create index if not exists invoices_org_status_idx on public.invoices (org_id, status);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0
);

create table if not exists public.job_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  kind text not null,
  storage_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Marketing / SMS (tenant-scoped; senders come later)
-- ---------------------------------------------------------------------------
create table if not exists public.sms_consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  phone text not null,
  consented boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table if not exists public.sms_opt_outs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  channel text not null default 'sms',
  status text not null default 'draft',
  body text,
  created_by uuid references public.profiles (id),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  phone text,
  email text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  direction text not null default 'outbound',
  phone text not null,
  body text not null,
  provider_id text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists sms_messages_org_created_idx on public.sms_messages (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','org_members','customers','billing_profiles','job_sites',
    'service_types','equipment','facilities','crew_profiles','work_orders','invoices',
    'sms_consents','marketing_campaigns'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-media',
  'job-media',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.customers enable row level security;
alter table public.billing_profiles enable row level security;
alter table public.job_sites enable row level security;
alter table public.service_types enable row level security;
alter table public.equipment enable row level security;
alter table public.facilities enable row level security;
alter table public.crew_profiles enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_logs enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.job_media enable row level security;
alter table public.sms_consents enable row level security;
alter table public.sms_opt_outs enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_recipients enable row level security;
alter table public.sms_messages enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id) or public.is_platform_admin('readonly'));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- platform_admins
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin('readonly'));
create policy platform_admins_write on public.platform_admins
  for all to authenticated
  using (public.is_platform_admin('owner'))
  with check (public.is_platform_admin('owner'));

-- organizations: never public. members + platform only.
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id, 'crew') or public.is_platform_admin('readonly'));
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_member(id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(id, 'admin') or public.is_platform_admin('support'));

-- org_members
create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy org_members_write on public.org_members
  for all to authenticated
  using (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy org_invites_select on public.org_invites
  for select to authenticated
  using (public.is_org_member(org_id, 'admin') or public.is_platform_admin('readonly'));
create policy org_invites_write on public.org_invites
  for all to authenticated
  using (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy platform_audit_select on public.platform_audit_log
  for select to authenticated
  using (public.is_platform_admin('readonly'));
create policy platform_audit_insert on public.platform_audit_log
  for insert to authenticated
  with check (public.is_platform_admin('support'));

-- Generic tenant read: any org member + platform
-- Generic tenant write: dispatcher+ or platform support
-- Accountant write on invoices; marketing write on SMS; crew updates assigned jobs.

create policy customers_select on public.customers
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy customers_write on public.customers
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy billing_profiles_select on public.billing_profiles
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy billing_profiles_write on public.billing_profiles
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy job_sites_select on public.job_sites
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy job_sites_write on public.job_sites
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy service_types_select on public.service_types
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy service_types_write on public.service_types
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy equipment_select on public.equipment
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy equipment_write on public.equipment
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy facilities_select on public.facilities
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy facilities_write on public.facilities
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));

create policy crew_profiles_select on public.crew_profiles
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy crew_profiles_write on public.crew_profiles
  for all to authenticated
  using (
    public.is_org_member(org_id, 'dispatcher')
    or (user_id = auth.uid() and public.is_org_member(org_id, 'crew'))
    or public.is_platform_admin('support')
  )
  with check (
    public.is_org_member(org_id, 'dispatcher')
    or (user_id = auth.uid() and public.is_org_member(org_id, 'crew'))
    or public.is_platform_admin('support')
  );

create policy work_orders_select on public.work_orders
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy work_orders_write_office on public.work_orders
  for all to authenticated
  using (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('support'));
create policy work_orders_update_crew on public.work_orders
  for update to authenticated
  using (technician_id = auth.uid() and public.is_org_member(org_id, 'crew'))
  with check (technician_id = auth.uid() and public.is_org_member(org_id, 'crew'));

create policy work_order_logs_select on public.work_order_logs
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy work_order_logs_insert on public.work_order_logs
  for insert to authenticated
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy invoices_select on public.invoices
  for select to authenticated
  using (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('readonly')
  );
create policy invoices_write on public.invoices
  for all to authenticated
  using (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('support')
  )
  with check (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('support')
  );

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('readonly')
  );
create policy invoice_items_write on public.invoice_items
  for all to authenticated
  using (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('support')
  )
  with check (
    public.is_org_member(org_id, 'accountant')
    or public.is_org_member(org_id, 'dispatcher')
    or public.is_platform_admin('support')
  );

create policy job_media_select on public.job_media
  for select to authenticated
  using (public.is_org_member(org_id, 'crew') or public.is_platform_admin('readonly'));
create policy job_media_insert on public.job_media
  for insert to authenticated
  with check (public.is_org_member(org_id, 'crew') or public.is_platform_admin('support'));

create policy sms_consents_select on public.sms_consents
  for select to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('readonly'));
create policy sms_consents_write on public.sms_consents
  for all to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy sms_opt_outs_select on public.sms_opt_outs
  for select to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('readonly'));
create policy sms_opt_outs_write on public.sms_opt_outs
  for all to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy marketing_campaigns_select on public.marketing_campaigns
  for select to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('readonly'));
create policy marketing_campaigns_write on public.marketing_campaigns
  for all to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy marketing_recipients_select on public.marketing_campaign_recipients
  for select to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('readonly'));
create policy marketing_recipients_write on public.marketing_campaign_recipients
  for all to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'))
  with check (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

create policy sms_messages_select on public.sms_messages
  for select to authenticated
  using (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'dispatcher') or public.is_platform_admin('readonly'));
create policy sms_messages_insert on public.sms_messages
  for insert to authenticated
  with check (public.is_org_member(org_id, 'marketing') or public.is_org_member(org_id, 'admin') or public.is_platform_admin('support'));

-- Storage: first folder = org_id
create policy job_media_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-media'
    and (
      public.is_org_member((storage.foldername(name))[1]::uuid, 'crew')
      or public.is_platform_admin('readonly')
    )
  );
create policy job_media_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-media'
    and (
      public.is_org_member((storage.foldername(name))[1]::uuid, 'crew')
      or public.is_platform_admin('support')
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.is_org_member(uuid, org_role) to authenticated;
grant execute on function public.is_platform_admin(text) to authenticated;
grant execute on function public.shares_org_with(uuid) to authenticated;
