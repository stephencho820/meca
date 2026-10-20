-- Run after both migrations on a disposable Postgres instance.
do $$
declare
 v_owner uuid:='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 v_shop uuid; v_service uuid; v_day date; v_start timestamptz; v_n integer;
begin
 insert into auth.users(id) values(v_owner);
 insert into public.shops(owner_id,name,slug,slot_capacity) values
   (v_owner,'Concurrency Test','meca-phase2-test',2) returning id into v_shop;
 select id into v_service from public.services where shop_id=v_shop and name='엔진오일 교환';
 select min(d::date) into v_day from generate_series(current_date+1,current_date+7,interval '1 day') d
   where extract(dow from d) between 1 and 5;
 perform public.create_public_booking('meca-phase2-test',v_service,v_day,'09:00','One','01012345678');
 perform public.create_public_booking('meca-phase2-test',v_service,v_day,'10:00','Two','01012345679');
 select count(*) into v_n from public.get_available_slots('meca-phase2-test',v_service,v_day)
   where time_label='09:30' and available;
 if v_n<>1 then raise exception 'FALSE_OVERLAP_CONFLICT'; end if;
 perform public.create_public_booking('meca-phase2-test',v_service,v_day,'09:30','Three','01012345670');
 begin
   perform public.create_public_booking('meca-phase2-test',v_service,v_day,'10:00','Four','01012345671');
   raise exception 'PUBLIC_CAPACITY_BYPASS';
 exception when others then if sqlerrm<>'SLOT_UNAVAILABLE' then raise; end if;
 end;
 v_start := (v_day+'10:00'::time) at time zone 'Asia/Seoul';
 begin
   insert into public.bookings(shop_id,service_id,service_name,customer_name,customer_phone,starts_at,ends_at,status,source)
   values(v_shop,v_service,'Forged','Manager','01012345672',v_start,v_start+interval '1 hour','confirmed','manual');
   raise exception 'DIRECT_CAPACITY_BYPASS';
 exception when others then if sqlerrm<>'SLOT_UNAVAILABLE' then raise; end if;
 end;
 begin
   update public.bookings set starts_at=starts_at+interval '30 minutes' where shop_id=v_shop and customer_name='One';
   raise exception 'IMMUTABLE_BYPASS';
 exception when others then if sqlerrm<>'INVALID_BOOKING' then raise; end if;
 end;
 insert into public.blocked_dates(shop_id,blocked_date) values(v_shop,v_day+7);
 select count(*) into v_n from public.get_available_slots('meca-phase2-test',v_service,v_day+7);
 if v_n<>0 then raise exception 'BLOCKED_DATE_SLOTS'; end if;
 v_start:=((v_day+7)+'10:00'::time) at time zone 'Asia/Seoul';
 begin
   insert into public.bookings(shop_id,service_id,service_name,customer_name,customer_phone,starts_at,ends_at,status,source)
   values(v_shop,v_service,'Forged','Blocked','01012345673',v_start,v_start+interval '1 hour','confirmed','manual');
   raise exception 'BLOCKED_DATE_BYPASS';
 exception when others then if sqlerrm<>'SLOT_UNAVAILABLE' then raise; end if;
 end;
 raise notice 'Phase 2 concurrency, sequential slots, manager conflict, immutable time, blocked date: PASS';
end $$;
