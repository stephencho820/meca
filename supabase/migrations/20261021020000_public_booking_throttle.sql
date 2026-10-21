-- Phase 8: minimal transactional abuse controls for open booking RPCs.
-- Enforced even for direct anonymous calls, not only the web frontend.
create index if not exists bookings_shop_phone_source_created_idx
  on public.bookings(shop_id,customer_phone,created_at desc) where source='web';

create or replace function public.create_public_booking(
 p_shop_slug text,p_service_id uuid,p_day date,p_time text,
 p_customer_name text,p_customer_phone text,
 p_vehicle_model text default '',p_notes text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare s record; v_start timestamptz; v_id uuid;
begin
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 80
    or coalesce(p_customer_phone,'') !~ '^01[0-9]{8,9}$'
    or length(coalesce(p_vehicle_model,'')) > 100
    or length(coalesce(p_notes,'')) > 500
    or coalesce(p_time,'') !~ '^[0-2][0-9]:[0-5][0-9]$'
    or p_day is null
  then raise exception 'INVALID_BOOKING'; end if;
  select sh.id as shop_id, svc.id as service_id, svc.name, svc.duration_minutes, svc.approval_required
    into s from public.shops sh join public.services svc on svc.shop_id=sh.id
  where sh.slug=p_shop_slug and sh.is_active and svc.id=p_service_id and svc.active;
  if not found then raise exception 'INVALID_BOOKING'; end if;
  -- Rate limiting must live in the database because anon callers can invoke
  -- the public booking RPC directly, bypassing the Next.js API route.
  -- Each shop and phone is serialized before checking a rolling time window.
  perform pg_advisory_xact_lock(hashtext(s.shop_id::text),hashtext('booking-phone:'||p_customer_phone));
  if (select count(*) from public.bookings b
      where b.shop_id=s.shop_id and b.customer_phone=p_customer_phone
      and b.source='web' and b.created_at>now()-interval '1 hour') >= 4
    or (select count(*) from public.bookings b
      where b.shop_id=s.shop_id and b.customer_phone=p_customer_phone
      and b.source='web' and b.created_at>now()-interval '1 day') >= 8
  then raise exception 'BOOKING_RATE_LIMIT';end if;
  perform pg_advisory_xact_lock(hashtext(s.shop_id::text),hashtext(p_day::text));
  if not exists(select 1 from public.get_available_slots(p_shop_slug,p_service_id,p_day) a
                where a.time_label=p_time and a.available)
    then raise exception 'SLOT_UNAVAILABLE'; end if;
  v_start=(p_day+p_time::time) at time zone 'Asia/Seoul';
  insert into public.bookings(
    shop_id,service_id,service_name,customer_name,customer_phone,
    vehicle_model,notes,starts_at,ends_at,status,source,privacy_consented_at
  ) values(
    s.shop_id,s.service_id,s.name,trim(p_customer_name),p_customer_phone,
    nullif(trim(p_vehicle_model),''),nullif(trim(p_notes),''),
    v_start,v_start+make_interval(mins=>s.duration_minutes),
    case when s.approval_required then 'pending' else 'confirmed' end,'web',now()
  ) returning id into v_id;
  return v_id;
end; $$;


-- The public call signature and grants are unchanged. No customer details
-- become visible to anonymous clients. This is NOT a replacement for IP
-- rate limiting, CAPTCHA, SMS verification or operational abuse monitoring.
