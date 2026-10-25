-- One owner-authorized test push per shop every 2 minutes.
-- No client role may directly read or modify the throttle table.
create table if not exists meca_private.owner_push_test_throttle (
 shop_id uuid primary key references public.shops(id) on delete cascade,
 last_sent_at timestamptz not null
);
revoke all on meca_private.owner_push_test_throttle from public,anon,authenticated;
create or replace function public.claim_owner_push_test(p_shop_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if p_shop_id is null or (select auth.uid()) is null or
    not exists(select 1 from public.shops s where s.id=p_shop_id and s.owner_id=(select auth.uid()))
 then return false;end if;
 perform pg_advisory_xact_lock(hashtext('owner-push-test'),hashtext(p_shop_id::text));
 insert into meca_private.owner_push_test_throttle(shop_id,last_sent_at)
 values(p_shop_id,now())
 on conflict(shop_id) do update set last_sent_at=excluded.last_sent_at
 where meca_private.owner_push_test_throttle.last_sent_at < now()-interval '2 minutes';
 get diagnostics v_count=row_count;
 return v_count=1;
end;$$;
revoke all on function public.claim_owner_push_test(uuid) from public,anon,authenticated;
grant execute on function public.claim_owner_push_test(uuid) to authenticated;
