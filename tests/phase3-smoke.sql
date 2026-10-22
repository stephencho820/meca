-- Phase 3: limited bearer-link access and lifecycle rules. Run in CI only.
do $$
declare
 u uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 sh uuid;svc uuid;d date; result jsonb; token text; bid uuid;
 snapshot jsonb; cancelled jsonb;
begin
 insert into auth.users(id) values(u);
 insert into public.shops(owner_id,name,slug) values(u,'Manage Shop','meca-manage-test') returning id into sh;
 select id into svc from public.services where shop_id=sh and name='엔진오일 교환';
 select min(t::date) into d from generate_series(current_date+2,current_date+8,interval '1 day') t
 where extract(dow from t) between 1 and 5;
 result := public.create_public_booking_v2('meca-manage-test',svc,d,'10:00','Alice','01012345678');
 token := result->>'manage_token';
 bid := (result->>'booking_id')::uuid;
 if token is null or length(token)<>64 then raise exception 'TOKEN_NOT_256_BIT'; end if;
 if (select manage_token_hash from public.bookings where id=bid)=token
 then raise exception 'RAW_TOKEN_STORED'; end if;
 if public.lookup_customer_booking(repeat('0',64)) is not null
 then raise exception 'INVALID_TOKEN_ACCEPTED'; end if;
 snapshot:=public.lookup_customer_booking(token);
 if snapshot->>'customer_name'<>'Alice' or snapshot->>'status'<>'pending'
 then raise exception 'LOOKUP_FAILED'; end if;
 if snapshot::text like '%01012345678%'
 then raise exception 'FULL_PHONE_EXPOSED'; end if;
 -- Existing booking should not prevent selecting itself when rescheduling.
 if not exists(
   select 1 from public.customer_manage_slots(token,d)
   where time_label='10:00' and available
 ) then raise exception 'OWN_SLOT_NOT_AVAILABLE'; end if;
 -- Same-day valid reschedule.
 snapshot:=public.manage_customer_booking(token,'reschedule',d,'11:00');
 if snapshot->>'starts_at' is null then raise exception 'RESCHEDULE_FAILED'; end if;
 if not exists(select 1 from public.bookings
  where id=bid and (starts_at at time zone 'Asia/Seoul')::time='11:00'::time)
 then raise exception 'RESCHEDULE_NOT_PERSISTED'; end if;
 -- Another customer occupies 12:00, which must be rejected.
 perform public.create_public_booking_v2('meca-manage-test',svc,d,'12:00','Bob','01012345679');
 begin
  perform public.manage_customer_booking(token,'reschedule',d,'12:00');
  raise exception 'RESCHEDULE_OVERBOOKED';
 exception when others then
  if sqlerrm<>'SLOT_UNAVAILABLE' then raise; end if;
 end;
 cancelled:=public.manage_customer_booking(token,'cancel',null,null);
 if cancelled->>'status'<>'cancelled' then raise exception 'CANCEL_FAILED'; end if;
 begin
  perform public.manage_customer_booking(token,'reschedule',d,'13:00');
  raise exception 'CANCELLED_WAS_EDITABLE';
 exception when others then if sqlerrm<>'BOOKING_NOT_EDITABLE' then raise; end if;
 end;
 raise notice 'Phase 3 tokens, masked phone, reschedule, conflict and cancel PASSED';
end $$;
