-- MECA shop operations acceptance: no durable writes.
-- This file uses explicit BEGIN/ROLLBACK, including production smoke execution.
-- All identities, contacts and shops below are disposable synthetic fixtures.
\set ON_ERROR_STOP on
BEGIN;
DO $acceptance$
declare
  owner_id uuid:=gen_random_uuid();
  slug text:='accept-'||substr(replace(gen_random_uuid()::text,'-',''),1,14);
  v_shop_id uuid;svc uuid;day date;
  first_id uuid;second_id uuid;tok text;tok2 text;result jsonb;
  staff1 uuid;staff2 uuid;lift1 uuid;lift2 uuid;request_id uuid;
  current_row public.bookings%rowtype;
begin
  insert into auth.users(id) values(owner_id);
  insert into public.shops(owner_id,name,slug,slot_capacity)
    values(owner_id,'Synthetic Acceptance Shop',slug,2) returning id into v_shop_id;
  -- Prevent variable/column name shadowing: resolve by shop slug.
  select s.id into svc from public.services s
    where s.shop_id=v_shop_id and s.name='엔진오일 교환' limit 1;
  if svc is null then raise exception 'ACCEPTANCE_DEFAULT_SERVICE_MISSING';end if;
  select min(t::date) into day
    from generate_series(current_date+3,current_date+12,'1 day'::interval) t
    where extract(dow from t) between 1 and 5;
  result:=public.create_public_booking_v2(slug,svc,day,'10:00',
    'Synthetic Customer One','01099990001','Synthetic Test Car','Acceptance fixture');
  first_id:=(result->>'booking_id')::uuid;tok:=result->>'manage_token';
  if tok is null or length(tok)<>64 then raise exception 'ACCEPTANCE_TOKEN_NOT_ISSUED';end if;
  if public.lookup_customer_booking(repeat('0',64)) is not null then
    raise exception 'ACCEPTANCE_TOKEN_GUARD_BROKEN';end if;
  result:=public.lookup_customer_booking(tok);
  if result->>'booking_id'<>first_id::text
      or result->>'customer_phone_last4'<>'0001'
      or result::text like '%01099990001%'
      or result::text ilike '%Acceptance fixture%'
      or result::text ilike '%internal_note%'
  then raise exception 'ACCEPTANCE_PRIVATE_LOOKUP_LEAK';end if;
  if not exists(select 1 from public.customers c where c.shop_id=v_shop_id and c.phone='01099990001')
     or not exists(select 1 from public.vehicles v where v.shop_id=v_shop_id and v.model='Synthetic Test Car')
  then raise exception 'ACCEPTANCE_CRM_NOT_LINKED';end if;
  insert into public.work_resources(shop_id,kind,name)
    values(v_shop_id,'technician','Acceptance Tech A') returning id into staff1;
  insert into public.work_resources(shop_id,kind,name)
    values(v_shop_id,'technician','Acceptance Tech B') returning id into staff2;
  insert into public.work_resources(shop_id,kind,name)
    values(v_shop_id,'bay','Acceptance Lift A') returning id into lift1;
  insert into public.work_resources(shop_id,kind,name)
    values(v_shop_id,'bay','Acceptance Lift B') returning id into lift2;
  update public.bookings set assigned_technician_id=staff1,assigned_bay_id=lift1,
    internal_note='OWNER ONLY' where id=first_id;
  result:=public.lookup_customer_booking(tok);
  if result::text like '%OWNER ONLY%' then raise exception 'ACCEPTANCE_INTERNAL_NOTE_LEAK';end if;
  result:=public.create_public_booking_v2(slug,svc,day,'10:00',
    'Synthetic Customer Two','01099990002','Synthetic Test Car 2','Second fixture');
  second_id:=(result->>'booking_id')::uuid;tok2:=result->>'manage_token';
  begin
    update public.bookings set assigned_technician_id=staff1 where id=second_id;
    raise exception 'ACCEPTANCE_DOUBLE_STAFF_ASSIGNMENT_ALLOWED';
  exception when others then
    if sqlerrm<>'RESOURCE_BUSY' then raise;end if;
  end;
  begin
    update public.bookings set assigned_bay_id=lift1 where id=second_id;
    raise exception 'ACCEPTANCE_DOUBLE_BAY_ASSIGNMENT_ALLOWED';
  exception when others then
    if sqlerrm<>'RESOURCE_BUSY' then raise;end if;
  end;
  update public.bookings set assigned_technician_id=staff2,assigned_bay_id=lift2 where id=second_id;
  result:=public.manage_customer_booking(tok,'reschedule',day,'11:00');
  if result->>'starts_at' is null then raise exception 'ACCEPTANCE_CUSTOMER_RESCHEDULE_FAILED';end if;
  select * into current_row from public.bookings where id=first_id;
  if (current_row.starts_at at time zone 'Asia/Seoul')::time<>'11:00'::time
  then raise exception 'ACCEPTANCE_RESCHEDULE_NOT_PERSISTED';end if;
  request_id:=public.request_booking_privacy_action(tok,'access');
  if not exists(select 1 from public.privacy_requests p
    where p.id=request_id and p.shop_id=v_shop_id and p.status='pending')
  then raise exception 'ACCEPTANCE_PRIVACY_QUEUE_MISSING';end if;
  update public.bookings set work_stage='checked_in' where id=first_id;
  update public.bookings set work_stage='working' where id=first_id;
  update public.bookings set work_stage='ready' where id=first_id;
  update public.bookings set work_stage='handed_over' where id=first_id;
  select * into current_row from public.bookings where id=first_id;
  if current_row.status<>'completed' or current_row.handed_over_at is null
  then raise exception 'ACCEPTANCE_HANDOVER_FAILED';end if;
  begin
    perform public.manage_customer_booking(tok,'reschedule',day,'12:00');
    raise exception 'ACCEPTANCE_COMPLETED_RESCHEDULE_ALLOWED';
  exception when others then
    if sqlerrm<>'BOOKING_NOT_EDITABLE' then raise;end if;
  end;
  result:=public.manage_customer_booking(tok2,'cancel',null,null);
  if result->>'status'<>'cancelled' then raise exception 'ACCEPTANCE_CANCEL_FAILED';end if;
  if not exists(select 1 from public.notification_outbox where booking_id=first_id)
  then raise exception 'ACCEPTANCE_NOTIFICATION_OUTBOX_MISSING';end if;
  raise notice 'MECA ACCEPTANCE PASS: private booking, CRM, staff, lift, collision, change, privacy, handover and cancel';
end;
$acceptance$;
ROLLBACK;
