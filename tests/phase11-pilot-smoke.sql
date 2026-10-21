-- First-shop pilot smoke test (CI-only, on disposable PostgreSQL instance).
begin;
create or replace function auth.uid() returns uuid language sql stable
as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
do $$
declare
 v_owner uuid:='77777777-7777-4777-8777-777777777777';
 v_code text:=repeat('a',64);
 v_shop uuid;v_end timestamptz;
begin
 insert into auth.users(id) values(v_owner);
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 insert into public.pilot_invitations(prospect_code,token_hash,shop_name,phone,address)
 values('ci-misterm',encode(extensions.digest(v_code,'sha256'),'hex'),
        '미스터엠','031-216-0464','경기 수원시 영통구 삼성로277번길 12-14');
 begin
  perform public.claim_meca_pilot(repeat('f',64));
  raise exception 'INVALID_INVITATION_ACCEPTED';
 exception when others then
  if sqlerrm<>'INVALID_INVITE' then raise;end if;
 end;
 v_shop:=public.claim_meca_pilot(v_code);
 if v_shop is null
  or (select is_active from public.shops where id=v_shop)
  or (select count(*) from public.services where shop_id=v_shop and active)>0
  or (select count(*) from public.business_hours where shop_id=v_shop and not is_closed)>0
 then raise exception 'PILOT_SHOULD_START_PRIVATE';end if;
 begin
  perform public.claim_meca_pilot(v_code);
  raise exception 'REUSE_INVITATION_ACCEPTED';
 exception when others then
  if sqlerrm<>'OWNER_ALREADY_HAS_SHOP' then raise;end if;
 end;
 begin
  update public.shops set is_active=true where id=v_shop;
  raise exception 'DIRECT_ACTIVATION_ALLOWED';
 exception when others then
  if sqlerrm<>'PILOT_ACTIVATION_REQUIRED' then raise;end if;
 end;
 begin
  perform public.activate_meca_pilot(v_shop,true,true,true,true);
  raise exception 'UNCONFIGURED_PILOT_ACTIVATED';
 exception when others then
  if sqlerrm<>'PILOT_DETAILS_INCOMPLETE' then raise;end if;
 end;
 update public.shops set privacy_policy_url='https://example.com/privacy/pilot' where id=v_shop;
 update public.business_hours set is_closed=false,open_time='09:00',close_time='12:00'
  where shop_id=v_shop and day_of_week=6;
 update public.services set active=true,approval_required=true
  where id=(select id from public.services where shop_id=v_shop order by sort_order limit 1);
 if (select count(*) from public.services where shop_id=v_shop and active and not approval_required)>0
 then raise exception 'PILOT_SERVICE_APPROVAL_NOT_ENFORCED';end if;
 v_end:=public.activate_meca_pilot(v_shop,true,true,true,true);
 if not (select is_active from public.shops where id=v_shop)
    or v_end<now()+interval '29 days'
    or v_end>now()+interval '31 days'
 then raise exception 'PILOT_ACTIVATION_FAILED';end if;
 if not exists(select 1 from public.pilot_enrollments
   where shop_id=v_shop and activated_at is not null and ends_at=v_end)
 then raise exception 'PILOT_ENROLLMENT_NOT_ACTIVATED';end if;
 if has_table_privilege('anon','public.pilot_invitations','SELECT')
   or has_table_privilege('authenticated','public.pilot_invitations','SELECT')
 then raise exception 'INVITATIONS_EXPOSED';end if;
 raise notice 'PASS: one-time invite, private shop, owner checklist, manual activation and 30-day trial';
end $$;
rollback;
