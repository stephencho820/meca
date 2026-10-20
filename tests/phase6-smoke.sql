-- Phase 6: CRM linkage, same-phone return visits and tenant boundaries.
do $$
declare
  owner_a uuid:='aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
  owner_b uuid:='bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb';
  shop_a uuid;shop_b uuid;svc_a uuid;svc_b uuid; d date;
  first_id uuid;second_id uuid;third_id uuid;fourth_id uuid;
  c_id uuid;c_b uuid;v1 uuid;v2 uuid;
begin
  insert into auth.users(id) values(owner_a),(owner_b);
  insert into public.shops(owner_id,name,slug) values(owner_a,'CRM A','crm-a') returning id into shop_a;
  insert into public.shops(owner_id,name,slug) values(owner_b,'CRM B','crm-b') returning id into shop_b;
  select id into svc_a from public.services where shop_id=shop_a and name='엔진오일 교환';
  select id into svc_b from public.services where shop_id=shop_b and name='엔진오일 교환';
  select min(t::date) into d from generate_series(current_date+2,current_date+8,interval '1 day') t where extract(dow from t) between 1 and 5;
  first_id:=public.create_public_booking('crm-a',svc_a,d,'09:00','Park','01012345678','Sorento');
  second_id:=public.create_public_booking('crm-a',svc_a,d,'11:00','Park','01012345678','K5');
  third_id:=public.create_public_booking('crm-a',svc_a,d,'13:00','Park','01012345678','Sorento');
  fourth_id:=public.create_public_booking('crm-b',svc_b,d,'10:00','Different','01012345678','Sonata');
  select customer_id,vehicle_id into c_id,v1 from public.bookings where id=first_id;
  select vehicle_id into v2 from public.bookings where id=second_id;
  select customer_id into c_b from public.bookings where id=fourth_id;
  if c_id is null or v1 is null or v2 is null or c_id=c_b or v1=v2
    or c_id is distinct from (select customer_id from public.bookings where id=second_id)
    or v1 is distinct from (select vehicle_id from public.bookings where id=third_id)
  then raise exception 'CRM_AUTOLINK_FAILED';end if;
  if (select count(*) from public.customers where shop_id=shop_a)<>1
    or (select count(*) from public.vehicles where shop_id=shop_a)<>2
  then raise exception 'CRM_DUPLICATE_CREATED';end if;
  insert into public.vehicles(shop_id,customer_id,model,plate,model_year,odometer_km,internal_note)
  values(shop_a,c_id,'Avante','123가4567',2020,58000,'Road test') returning id into v2;
  if (select odometer_km from public.vehicles where id=v2)<>58000 then raise exception 'CAR_DETAIL_SAVE';end if;
  update public.customers set internal_note='Returning customer' where id=c_id;
  if (select internal_note from public.customers where id=c_id)<>'Returning customer'
  then raise exception 'CUSTOMER_NOTE_SAVE';end if;
  begin
    update public.customers set phone='01011112222' where id=c_id;
    raise exception 'PHONE_IDENTITY_CHANGED';
  exception when others then if sqlerrm<>'CRM_IMMUTABLE_PHONE' then raise;end if;end;
  begin
    update public.vehicles set customer_id=c_b where id=v2;
    raise exception 'VEHICLE_MOVED_BETWEEN_TENANTS';
  exception when others then if sqlerrm<>'CRM_IMMUTABLE_OWNER' then raise;end if;end;
  -- Owner changing a booking contact should rebind its customer ID.
  update public.bookings set customer_name='Kim',customer_phone='01055556666'
   where id=second_id;
  if (select customer_id from public.bookings where id=second_id)=c_id
  then raise exception 'CUSTOMER_REASSOCIATION_MISSING';end if;
  if (select count(*) from public.customers where shop_id=shop_a)<>2
  then raise exception 'NEW_CUSTOMER_NOT_CREATED';end if;
  -- No privileged ids can be forged by an owner updating an unrelated field.
  update public.bookings set customer_id=c_b, vehicle_id=v2 where id=first_id;
  if (select customer_id from public.bookings where id=first_id)<>c_id
  then raise exception 'BOOKING_PROFILE_FORGERY';end if;
  raise notice 'Phase 6: auto-link, repeat visits, multiple vehicles, isolation, CRM restrictions PASS';
end $$;

-- All new exposed CRM tables must be RLS-protected.
do $$
begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('customers','vehicles') and c.relrowsecurity)<>2
 then raise exception 'CRM_RLS_MISSING';end if;
 if has_table_privilege('anon','public.customers','SELECT')
   or has_table_privilege('anon','public.vehicles','SELECT')
 then raise exception 'CRM_ANON_DATA_EXPOSURE';end if;
end $$;
