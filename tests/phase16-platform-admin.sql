-- Phase 16: synthetic authorization and suspension smoke tests (rolled back).
\set ON_ERROR_STOP on
BEGIN;

-- CI auth.uid() is a stub. Emulate verified PostgREST JWT sub ONLY in this
-- rollback-only test transaction; never deploy this override.
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000016','phase16-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000017','phase16-operator@example.invalid');
insert into public.shops(owner_id,name,slug,is_active)
values('00000000-0000-4000-8000-000000000016',
       'Phase 16 synthetic garage','phase16-garage-test',true);
insert into meca_private.platform_operators(user_id,note)
values('00000000-0000-4000-8000-000000000017','Synthetic CI operator only');

do $$
begin
  if not (select relrowsecurity from pg_class where oid='meca_private.platform_operators'::regclass)
     or not (select relrowsecurity from pg_class where oid='meca_private.platform_shop_audit'::regclass)
  then raise exception 'PLATFORM_RLS_DISABLED'; end if;
  if has_function_privilege('anon','public.meca_admin_shops()','EXECUTE')
     or has_function_privilege('anon','public.meca_is_operator()','EXECUTE')
     or has_function_privilege('anon','public.meca_admin_set_shop_suspension(uuid,boolean,text)','EXECUTE')
     or has_table_privilege('authenticated','meca_private.platform_operators','SELECT')
  then raise exception 'PLATFORM_PRIVILEGES_EXPOSED'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000016',true);

do $$
begin
  if public.meca_is_operator() then raise exception 'OWNER_IS_OPERATOR'; end if;
  begin
    perform * from public.meca_admin_shops();
    raise exception 'OWNER_COULD_READ_PLATFORM';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.meca_admin_shop_audit();
    raise exception 'OWNER_COULD_READ_AUDIT';
  exception when insufficient_privilege then null; end;
  begin
    perform public.meca_admin_set_shop_suspension(
       (select id from public.shops where slug='phase16-garage-test'),
       true,'Disallowed owner change');
    raise exception 'OWNER_COULD_SUSPEND';
  exception when insufficient_privilege then null; end;
  begin
    update public.shops set platform_suspended=true where slug='phase16-garage-test';
    raise exception 'OWNER_COULD_CHANGE_PLATFORM_FLAG';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',true);

do $$
begin
  if not public.meca_is_operator() then raise exception 'OPERATOR_NOT_RECOGNIZED'; end if;
  if not exists (
    select 1 from public.meca_admin_shops()
      where slug='phase16-garage-test'
        and owner_email='phase16-owner@example.invalid' and is_active
  ) then raise exception 'OPERATOR_CANNOT_LIST_SHOPS'; end if;
  if not public.meca_admin_set_shop_suspension(
     (select shop_id from public.meca_admin_shops() where slug='phase16-garage-test'),
     true,'Synthetic abuse report reviewed')
  then raise exception 'SUSPEND_FAILED';end if;
  if not exists (
    select 1 from public.meca_admin_shops()
    where slug='phase16-garage-test' and platform_suspended and not is_active
  ) then raise exception 'SUSPENSION_NOT_APPLIED'; end if;
  if not exists (
    select 1 from public.meca_admin_shop_audit()
    where shop_name='Phase 16 synthetic garage'
      and action='suspended' and reason='Synthetic abuse report reviewed'
  ) then raise exception 'AUDIT_MISSING'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000016',true);

do $$
begin
  begin
    update public.shops set is_active=true where slug='phase16-garage-test';
    raise exception 'OWNER_REACTIVATED_SUSPENDED_SHOP';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.shops where slug='phase16-garage-test';
    raise exception 'OWNER_DELETED_SUSPENDED_SHOP';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shops(owner_id,name,slug)
    values('00000000-0000-4000-8000-000000000016','Bypass','phase16-bypass-test');
    raise exception 'OWNER_RECREATED_SHOP';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',true);

do $$
begin
  if public.meca_admin_set_shop_suspension(
     (select shop_id from public.meca_admin_shops() where slug='phase16-garage-test'),
     false,'Owner verified and suspension released')
  then raise exception 'RELEASE_RESULT_INCORRECT'; end if;
  if not exists (
    select 1 from public.meca_admin_shops()
      where slug='phase16-garage-test' and not platform_suspended and not is_active
  ) then raise exception 'RELEASE_MUST_NOT_REOPEN'; end if;
  if (select count(*) from public.meca_admin_shop_audit()
      where shop_name='Phase 16 synthetic garage')<>2
  then raise exception 'AUDIT_COUNT_INCORRECT'; end if;
  raise notice 'PASS: operator-only aggregates, owner isolation, shop suspension, anti-bypass and audit';
end $$;

ROLLBACK;
