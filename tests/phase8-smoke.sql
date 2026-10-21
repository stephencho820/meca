-- Phase 8 abuse protection. Separate from production data.
do $$
declare o uuid:='88888888-8888-4888-8888-888888888888';
  shop1 uuid;shop2 uuid;svc1 uuid;svc2 uuid;d date;i integer;
begin
 insert into auth.users(id) values(o);
 insert into public.shops(owner_id,name,slug,slot_capacity)
  values(o,'Quota One','quota-one',2) returning id into shop1;
 insert into public.shops(owner_id,name,slug,slot_capacity)
  values(o,'Quota Two','quota-two',2) returning id into shop2;
 select id into svc1 from public.services where shop_id=shop1 and name='엔진오일 교환';
 select id into svc2 from public.services where shop_id=shop2 and name='엔진오일 교환';
 select min(z::date) into d from generate_series(current_date+2,current_date+8,'1 day'::interval) z
    where extract(dow from z) between 1 and 5;
 for i in 1..4 loop
   perform public.create_public_booking('quota-one',svc1,d,
      (array['09:00','10:00','11:00','13:00'])[i],'Tester','01090000001');
 end loop;
 begin
   perform public.create_public_booking('quota-one',svc1,d,'14:00','Tester','01090000001');
   raise exception 'RATE_LIMIT_BYPASSED';
 exception when others then
   if sqlerrm<>'BOOKING_RATE_LIMIT' then raise;end if;
 end;
 -- Same phone may legitimately use a different garage.
 perform public.create_public_booking('quota-two',svc2,d,'14:00','Tester','01090000001');
 -- A distinct customer isn't blocked by the first customer's limit.
 perform public.create_public_booking('quota-one',svc1,d,'14:00','Other','01090000002');
 if (select count(*) from public.bookings where shop_id=shop1)<>5
 then raise exception 'QUOTA_COUNT_INCORRECT';end if;
 raise notice 'Phase 8: per-shop phone quota, direct-RPC abuse and tenant separation PASS';
end $$;
