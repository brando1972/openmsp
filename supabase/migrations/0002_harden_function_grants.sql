-- Pin search_path and revoke anon execute on SECURITY DEFINER helpers.

create or replace function public.org_role_rank(r org_role)
returns int language sql immutable set search_path = public as $$
  select case r
    when 'owner' then 60 when 'admin' then 50 when 'dispatcher' then 40
    when 'accountant' then 30 when 'marketing' then 20 when 'crew' then 10
  end;
$$;

create or replace function public.platform_role_rank(r platform_role)
returns int language sql immutable set search_path = public as $$
  select case r
    when 'owner' then 30 when 'support' then 20 when 'readonly' then 10
  end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_organization(text, text) from public, anon;
revoke all on function public.is_org_member(uuid, org_role) from public, anon;
revoke all on function public.is_platform_admin(text) from public, anon;
revoke all on function public.shares_org_with(uuid) from public, anon;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.is_org_member(uuid, org_role) to authenticated;
grant execute on function public.is_platform_admin(text) to authenticated;
grant execute on function public.shares_org_with(uuid) to authenticated;
