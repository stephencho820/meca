-- Phase 7 resource assignment isolation and collision tests.
do $$
declare
 owner1 uuid:='11111111-1111-4111-8111-111111111111';
 owner2 uuid:='22222222-2222-4222-8222-222222222222';
 s1 uuid;s2 uuid;svc1 uuid;svc2 uuid;d date;
 a uuid;b uuid;c uuid;t1 uuid;t2 uuid;bay1 uuid;bay2 uuid;other_staff uuid;
begin
 insert into auth.users(id) values(owner1),(owner2);
 insert into public.shops(owner_id,name,slug,slot_capacity)
   values(owner1,'Resource Test Shop','resource-test-shop',3) returning id into s1;
 insert into public.shops(owner_id,name,slug,slot_capacity)
   values(owner2,'Other Resource Shop','resource-other-shop',2) returning id into s2;
 select id into svc1 from public.services where shop_id=s1 and name='엔진오일 교환';
 select id into svc2 from public.services where shop_id=s2 and name='엔진오일 교환';
 select min(z::date) into d from generate_series(current_date+2,current_date+8,'1 day'::interval) z
   where extract(dow from z) between 1 and 5;
 insert into public.work_resources(shop_id,kind,name) values(s1,'technician','Technician 1') returning id into t1;
 insert into public.work_resources(shop_id,kind,name) values(s1,'technician','Technician 2') returning id into t2;
 insert into public.work_resources(shop_id,kind,name) values(s1,'bay','Lift 1') returning id into bay1;
 insert into public.work_resources(shop_id,kind,name) values(s1,'bay','Lift 2') returning id into bay2;
 insert into public.work_resources(shop_id,kind,name) values(s2,'technician','Outside') returning id into other_staff;
 a:=public.create_public_booking('resource-test-shop',svc1,d,'09:00','First','01010000001');
 b:=public.create_public_booking('resource-test-shop',svc1,d,'09:00','Second','01010000002');
 c:=public.create_public_booking('resource-test-shop',svc1,d,'09:00','Third','01010000003');
 update public.bookings set assigned_technician_id=t1,assigned_bay_id=bay1 where id=a;
 update public.bookings set assigned_technician_id=t2,assigned_bay_id=bay2 where id=b;
 begin
   update public.bookings set assigned_technician_id=t1,assigned_bay_id=null where id=c;
   raise exception 'SAME_TECHNICIAN_DOUBLE_ASSIGNED';
 exception when others then if sqlerrm<>'RESOURCE_BUSY' then raise;end if;end;
 begin
   update public.bookings set assigned_bay_id=bay1 where id=c;
   raise exception 'SAME_BAY_DOUBLE_ASSIGNED';
 exception when others then if sqlerrm<>'RESOURCE_BUSY' then raise;end if;end;
 begin
   update public.bookings set assigned_technician_id=bay1 where id=c;
   raise exception 'WRONG_KIND_ACCEPTED';
 exception when others then if sqlerrm<>'INVALID_RESOURCE' then raise;end if;end;
 begin
   update public.bookings set assigned_technician_id=other_staff where id=c;
   raise exception 'FOREIGN_SHOP_RESOURCE_ACCEPTED';
 exception when others then
   if sqlstate<>'23503' and sqlerrm<>'INVALID_RESOURCE' then raise;end if;
 end;
 begin
   update public.work_resources set active=false where id=t1;
   raise exception 'OCCUPIED_RESOURCE_DEACTIVATED';
 exception when others then if sqlerrm<>'RESOURCE_IN_USE' then raise;end if;end;
 update public.bookings set status='cancelled' where id=a;
 update public.bookings set assigned_technician_id=t1,assigned_bay_id=bay1 where id=c;
 if not exists(select 1 from public.bookings where id=c and assigned_bay_id=bay1)
 then raise exception 'RELEASED_RESOURCE_NOT_REUSABLE';end if;
 begin
   update public.bookings set starts_at=(d+'09:30'::time) at time zone 'Asia/Seoul',
     ends_at=(d+'10:30'::time) at time zone 'Asia/Seoul' where id=b;
   -- This is a valid same-resource shift, and should not collide with c.
 exception when others then raise exception 'VALID_SHIFT_REJECTED: %',sqlerrm;end;
 raise notice 'Phase 7: staff, bay, shop isolation, release, deactivation, rescheduling PASS';
end $$;
do $$
begin
 if has_table_privilege('anon','public.work_resources','SELECT') then raise exception 'ANON_RESOURCE_READ';end if;
 if not (select relrowsecurity from pg_class where oid='public.work_resources'::regclass) then
   raise exception 'RESOURCES_RLS_MISSING'; end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename='work_resources')<>3 then
   raise exception 'RESOURCES_OWNER_POLICY_MISSING';end if;
end $$;
