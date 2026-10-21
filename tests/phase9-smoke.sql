-- Phase 9 data-rights request intake / tenant isolation.
do $$
declare
 u uuid:='99999999-9999-4999-8999-999999999999';
 sh uuid;svc uuid;d date;v jsonb;token text;bid uuid;r1 uuid;r2 uuid;
begin
 insert into auth.users(id) values(u);
 insert into public.shops(owner_id,name,slug) values(u,'Privacy Smoke Shop','privacy-smoke-shop') returning id into sh;
 select id into svc from public.services where shop_id=sh and name='엔진오일 교환';
 select min(t::date) into d from generate_series(current_date+2,current_date+8,'1 day'::interval) t
  where extract(dow from t) between 1 and 5;
 v:=public.create_public_booking_v2('privacy-smoke-shop',svc,d,'10:00','Owner','01080000001');
 token:=v->>'manage_token';
 bid:=(v->>'booking_id')::uuid;
 begin
  perform public.request_booking_privacy_action(repeat('0',64),'erase');
  raise exception 'GUESSABLE_TOKEN_BYPASS';
 exception when others then
  if sqlerrm<>'INVALID_MANAGEMENT_LINK' then raise;end if;
 end;
 r1:=public.request_booking_privacy_action(token,'erase');
 r2:=public.request_booking_privacy_action(token,'erase');
 if r1 is null or r1<>r2 then raise exception 'PRIVACY_DUPLICATE_CREATED';end if;
 perform public.request_booking_privacy_action(token,'access');
 perform public.request_booking_privacy_action(token,'rectify');
 begin
  perform public.request_booking_privacy_action(token,'erase');
  raise exception 'PRIVACY_REQUEST_SPAM_ALLOWED';
 exception when others then
  if sqlerrm<>'PRIVACY_REQUEST_LIMIT' then raise;end if;
 end;
 update public.privacy_requests set status='reviewing',owner_note='Reviewing request' where id=r1;
 update public.privacy_requests set status='closed' where id=r1;
 if (select closed_at from public.privacy_requests where id=r1) is null
 then raise exception 'PRIVACY_CLOSE_TIMESTAMP';end if;
 begin
  update public.privacy_requests set status='pending' where id=r1;
  raise exception 'PRIVACY_REOPEN_ALLOWED';
 exception when others then
  if sqlerrm<>'PRIVACY_CLOSED' then raise;end if;
 end;
 if (select count(*) from public.bookings where id=bid)<>1
 then raise exception 'ERASE_REQUEST_DELETED_REAL_BOOKING';end if;
 raise notice 'Phase 9: bearer-link rights intake, idempotency, spam guard, review lifecycle PASS';
end $$;
do $$
begin
 if has_table_privilege('anon','public.privacy_requests','SELECT')
 then raise exception 'ANON_PRIVACY_QUEUE_EXPOSED';end if;
 if not (select relrowsecurity from pg_class where oid='public.privacy_requests'::regclass)
 then raise exception 'PRIVACY_REQUEST_RLS_MISSING';end if;
end $$;
