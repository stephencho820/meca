-- Run AFTER bootstrap auth schema/roles and initial MECA migration, on a disposable PostgreSQL database.
do $$
declare
  v_owner uuid := 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  v_shop uuid;
  v_service uuid;
  v_day date;
  v_booking uuid;
  v_count integer;
begin
  insert into auth.users(id) values(v_owner);
  insert into public.shops(owner_id,name,slug) values(v_owner,'메카 테스트 매장','meca-sql-test') returning id into v_shop;
  select count(*) into v_count from public.services where shop_id=v_shop;
  if v_count<>5 then raise exception 'Default services not generated: %', v_count; end if;
  select count(*) into v_count from public.business_hours where shop_id=v_shop;
  if v_count<>7 then raise exception 'Default hours not generated: %', v_count; end if;
  select id into v_service from public.services where shop_id=v_shop and name='엔진오일 교환';
  select min(x::date) into v_day
  from generate_series(current_date+1,current_date+7,interval '1 day') x
  where extract(dow from x) between 1 and 5;
  select count(*) into v_count from public.get_available_slots('meca-sql-test',v_service,v_day) where time_label='10:00' and available;
  if v_count<>1 then raise exception 'Expected bookable 10:00 time slot, got %',v_count; end if;
  v_booking:=public.create_public_booking('meca-sql-test',v_service,v_day,'10:00','홍길동','01012345678','쏘렌토','테스트 예약');
  if v_booking is null then raise exception 'Booking creation failed'; end if;
  select count(*) into v_count from public.bookings where id=v_booking and status='pending' and source='web';
  if v_count<>1 then raise exception 'Booking not persisted with expected status'; end if;
  begin
    perform public.create_public_booking('meca-sql-test',v_service,v_day,'10:00','테스트 고객','01012345678','','');
    raise exception 'OVERBOOKING_WAS_ACCEPTED';
  exception when others then
    if sqlerrm <> 'SLOT_UNAVAILABLE' then raise; end if;
  end;
  raise notice 'MECA migration smoke test passed; collision prevented.';
end $$;
