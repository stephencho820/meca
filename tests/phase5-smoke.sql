-- Phase 5 smoke: booking editor, capacity, workshop lifecycle on disposable DB.
do $$
declare
 owner_id uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 v_shop_id uuid; service_id uuid; alt_id uuid; day date; booking_id uuid;
 s timestamptz; e timestamptz; other_id uuid; row public.bookings%rowtype;
begin
 insert into auth.users(id) values(owner_id);
 insert into public.shops(owner_id,name,slug) values(owner_id,'Workshop smoke','workshop-smoke')
 returning id into v_shop_id;
 select id into service_id from public.services where shop_id=v_shop_id and name='엔진오일 교환' limit 1;
 select id into alt_id from public.services where shop_id=v_shop_id and name='브레이크 점검' limit 1;
 select min(t::date) into day from generate_series(current_date+2,current_date+8,interval '1 day') t
   where extract(dow from t) between 1 and 5;
 booking_id := public.create_public_booking('workshop-smoke',service_id,day,'09:00','Park','01012345678');
 other_id := public.create_public_booking('workshop-smoke',service_id,day,'11:00','Kim','01012345679');
 s:=(day+'10:00'::time) at time zone 'Asia/Seoul';e:=s+interval '90 minutes';
 begin
   update public.bookings set starts_at=s,ends_at=e,service_id=alt_id where id=booking_id;
   raise exception 'CAPACITY_BYPASS';
 exception when others then
   if sqlerrm<>'SLOT_UNAVAILABLE' then raise; end if;
 end;
 s:=(day+'13:00'::time) at time zone 'Asia/Seoul';e:=s+interval '90 minutes';
 update public.bookings set starts_at=s,ends_at=e,service_id=alt_id,
    customer_name='Park updated',vehicle_model='Sorento',internal_note='Inspection planned'
 where id=booking_id;
 select * into row from public.bookings where id=booking_id;
 if row.service_id<>alt_id or row.service_name<>'브레이크 점검'
    or row.customer_name<>'Park updated' or row.internal_note<>'Inspection planned'
    or row.starts_at<>s or row.updated_at is null
 then raise exception 'EDIT_MISSING'; end if;
 update public.bookings set work_stage='checked_in' where id=booking_id;
 select * into row from public.bookings where id=booking_id;
 if row.checked_in_at is null then raise exception 'CHECKIN_TIMESTAMP_MISSING'; end if;
 update public.bookings set work_stage='working' where id=booking_id;
 update public.bookings set work_stage='ready' where id=booking_id;
 update public.bookings set work_stage='handed_over' where id=booking_id;
 select * into row from public.bookings where id=booking_id;
 if row.status<>'completed' or row.handed_over_at is null
   or row.work_ready_at is null or row.work_started_at is null
 then raise exception 'HANDOVER_NOT_COMPLETED'; end if;
 begin
   update public.bookings set work_stage='working' where id=booking_id;
   raise exception 'CLOSED_WORKFLOW_BYPASS';
 exception when others then if sqlerrm<>'WORKFLOW_CLOSED' then raise; end if;
 end;
 begin
   update public.bookings set starts_at=s+interval '30 minutes',ends_at=e+interval '30 minutes'
     where id=booking_id;
   raise exception 'CLOSED_TIME_BYPASS';
 exception when others then if sqlerrm<>'BOOKING_CLOSED' then raise; end if;
 end;
 raise notice 'Phase 5 manager edits, capacity validation, lifecycle and closed booking test: PASS';
end $$;
