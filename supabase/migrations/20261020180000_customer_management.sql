-- Phase 3: secret-link booking management without SMS OTP.
-- Existing bookings are untouched. Only new v2 bookings receive management tokens.
alter table public.bookings add column if not exists manage_token_hash text;
create unique index if not exists bookings_manage_token_hash_uq
  on public.bookings (manage_token_hash) where manage_token_hash is not null;
-- Historical bookings have null hashes and must be managed by the shop owner.

-- Allow manager/customer rescheduling only when every invariant is rechecked
-- by the booking trigger (service duration, shop hours, holiday and capacity).
create or replace function meca_private.guard_booking()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_shop record;
  v_service record;
  v_hours record;
  v_start_local timestamp;
  v_end_local timestamp;
  v_day date;
  v_check boolean := false;
begin
  if tg_op = 'INSERT' then
    v_check := new.status in ('pending','confirmed');
  else
    if new.shop_id is distinct from old.shop_id
      or new.service_id is distinct from old.service_id
    then
      raise exception 'IMMUTABLE_BOOKING';
    end if;
    -- Rescheduling active bookings must repeat the capacity check.
    v_check := new.status in ('pending','confirmed')
      and (old.status not in ('pending','confirmed')
        or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at);
  end if;

  if not v_check then return new; end if;
  select s.slot_capacity,s.is_active into v_shop
    from public.shops s where s.id=new.shop_id;
  select svc.name,svc.duration_minutes,svc.active into v_service
    from public.services svc
    where svc.id=new.service_id and svc.shop_id=new.shop_id;
  if not found or not coalesce(v_shop.is_active,false)
    or not coalesce(v_service.active,false)
    or new.ends_at<>new.starts_at+make_interval(mins=>v_service.duration_minutes)
  then raise exception 'INVALID_BOOKING'; end if;

  v_start_local := new.starts_at at time zone 'Asia/Seoul';
  v_end_local := new.ends_at at time zone 'Asia/Seoul';
  v_day := v_start_local::date;
  if v_day<>v_end_local::date or v_end_local<=v_start_local
    or new.ends_at <= now()
  then raise exception 'SLOT_UNAVAILABLE'; end if;

  select h.open_time,h.close_time,h.is_closed into v_hours
  from public.business_hours h
  where h.shop_id=new.shop_id
    and h.day_of_week=extract(dow from v_day)::integer;
  if not found or v_hours.is_closed
    or v_start_local::time < v_hours.open_time
    or v_end_local::time > v_hours.close_time
    or exists (select 1 from public.blocked_dates d
              where d.shop_id=new.shop_id and d.blocked_date=v_day)
  then raise exception 'SLOT_UNAVAILABLE'; end if;

  -- The same advisory key is acquired by the public RPC. This serializes
  -- direct manager bookings with customer bookings without table-wide locks.
  perform pg_advisory_xact_lock(hashtext(new.shop_id::text),hashtext(v_day::text));
  if not meca_private.has_capacity(
     new.shop_id,new.starts_at,new.ends_at,v_shop.slot_capacity,
     case when tg_op='UPDATE' then new.id else null end
  ) then raise exception 'SLOT_UNAVAILABLE'; end if;
  new.service_name := v_service.name;
  return new;
end;
$$;
revoke all on function meca_private.guard_booking() from public,anon,authenticated;



-- Service-layer RPC creates a 256-bit unguessable management token.
-- Never store the raw token in Postgres: only SHA-256 of it is retained.
create or replace function public.create_public_booking_v2(
  p_shop_slug text,p_service_id uuid,p_day date,p_time text,
  p_customer_name text,p_customer_phone text,
  p_vehicle_model text default '',p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_token text;
begin
  v_id := public.create_public_booking(
    p_shop_slug,p_service_id,p_day,p_time,p_customer_name,p_customer_phone,
    p_vehicle_model,p_notes
  );
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  update public.bookings
    set manage_token_hash=encode(extensions.digest(v_token,'sha256'),'hex')
    where id=v_id;
  return jsonb_build_object('booking_id',v_id,'manage_token',v_token);
end;
$$;
revoke all on function public.create_public_booking_v2(text,uuid,date,text,text,text,text,text)
  from public;
grant execute on function public.create_public_booking_v2(text,uuid,date,text,text,text,text,text)
  to anon,authenticated;

-- Secret bearer link is verified in the DB; never query the table by phone,
-- which would expose customer information through guessable identifiers.
create or replace function public.lookup_customer_booking(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_booking record;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then return null; end if;
  select b.id,b.customer_name,b.customer_phone,b.vehicle_model,b.service_name,
     b.status,b.starts_at,b.ends_at,b.shop_id,b.service_id,
     s.name as shop_name,s.slug as shop_slug,s.phone as shop_phone
    into v_booking
    from public.bookings b join public.shops s on s.id=b.shop_id
    where b.manage_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if not found then return null; end if;
  return jsonb_build_object(
    'booking_id',v_booking.id,
    'customer_name',v_booking.customer_name,
    'customer_phone_last4',right(v_booking.customer_phone,4),
    'vehicle_model',v_booking.vehicle_model,
    'service_name',v_booking.service_name,
    'status',v_booking.status,
    'starts_at',v_booking.starts_at,
    'ends_at',v_booking.ends_at,
    'shop_name',v_booking.shop_name,
    'shop_slug',v_booking.shop_slug,
    'shop_phone',v_booking.shop_phone
  );
end;
$$;
revoke all on function public.lookup_customer_booking(text) from public;
grant execute on function public.lookup_customer_booking(text) to anon,authenticated;

-- Return candidate times using the same shop hours and capacity rules,
-- excluding the customer's existing booking from the occupancy check.
create or replace function public.customer_manage_slots(p_token text,p_day date)
returns table(time_label text,available boolean)
language plpgsql security definer set search_path=''
as $$
declare b record;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' or p_day is null
    or p_day < (now() at time zone 'Asia/Seoul')::date
    or p_day > (now() at time zone 'Asia/Seoul')::date + 30 then return; end if;
  select x.id,x.shop_id,x.service_id,x.status,sh.slot_capacity,svc.duration_minutes
    into b from public.bookings x
    join public.shops sh on sh.id=x.shop_id
    join public.services svc on svc.id=x.service_id and svc.shop_id=sh.id
    where x.manage_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and x.status in ('pending','confirmed') and x.starts_at > now()+interval '1 hour'
      and sh.is_active and svc.active;
  if not found then return; end if;
  if exists(select 1 from public.blocked_dates d
            where d.shop_id=b.shop_id and d.blocked_date=p_day) then return; end if;
  return query
    select to_char(slot.slot_start at time zone 'Asia/Seoul','HH24:MI') as time_label,
    (slot.slot_start>now()+interval '1 hour'
      and meca_private.has_capacity(
        b.shop_id,slot.slot_start,slot.slot_start+make_interval(mins=>b.duration_minutes),
        b.slot_capacity,b.id)
    ) as available
    from public.business_hours h
    cross join lateral generate_series(
      (p_day+h.open_time) at time zone 'Asia/Seoul',
      (p_day+h.close_time-make_interval(mins=>b.duration_minutes)) at time zone 'Asia/Seoul',
      interval '30 minutes'
    ) slot(slot_start)
    where h.shop_id=b.shop_id and h.day_of_week=extract(dow from p_day)::int
      and not h.is_closed
    order by slot.slot_start;
end;
$$;
revoke all on function public.customer_manage_slots(text,date) from public;
grant execute on function public.customer_manage_slots(text,date) to anon,authenticated;

-- Cancel or reschedule a booking in one transaction. Customer must have the
-- 256-bit private link. This is intentionally not "phone number lookup".
create or replace function public.manage_customer_booking(
  p_token text,p_action text,p_day date default null,p_time text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare b record; v_start timestamptz; v_end timestamptz; v_is_available boolean;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
     or p_action not in ('cancel','reschedule')
  then raise exception 'INVALID_MANAGEMENT_LINK'; end if;
  select x.id,x.shop_id,x.service_id,x.starts_at,x.status,sh.slug,
    sh.slot_capacity,svc.duration_minutes
  into b from public.bookings x
  join public.shops sh on sh.id=x.shop_id
  join public.services svc on svc.id=x.service_id and svc.shop_id=sh.id
  where x.manage_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
  for update of x;
  if not found then raise exception 'INVALID_MANAGEMENT_LINK'; end if;
  if b.status not in ('pending','confirmed') then raise exception 'BOOKING_NOT_EDITABLE'; end if;
  if b.starts_at <= now()+interval '1 hour' then raise exception 'EDIT_CUTOFF'; end if;

  if p_action='cancel' then
    update public.bookings set status='cancelled' where id=b.id;
  else
    if p_day is null or coalesce(p_time,'') !~ '^([01][0-9]|2[0-3]):(00|30)$'
       or p_day<(now() at time zone 'Asia/Seoul')::date
       or p_day>(now() at time zone 'Asia/Seoul')::date+30
    then raise exception 'INVALID_BOOKING'; end if;
    v_start := (p_day+p_time::time) at time zone 'Asia/Seoul';
    v_end := v_start + make_interval(mins=>b.duration_minutes);
    if v_start <= now()+interval '1 hour' then raise exception 'EDIT_CUTOFF'; end if;

    -- Recheck while holding the shop-day advisory lock for atomicity. The
    -- booking trigger uses the same key, and revalidates after UPDATE.
    perform pg_advisory_xact_lock(hashtext(b.shop_id::text),hashtext(p_day::text));
    select exists(
      select 1 from public.customer_manage_slots(p_token,p_day) slot
      where slot.time_label=p_time and slot.available
    ) into v_is_available;
    if not v_is_available then raise exception 'SLOT_UNAVAILABLE'; end if;
    update public.bookings
      set starts_at=v_start,ends_at=v_end where id=b.id;
  end if;
  return public.lookup_customer_booking(p_token);
end;
$$;
revoke all on function public.manage_customer_booking(text,text,date,text) from public;
grant execute on function public.manage_customer_booking(text,text,date,text)
  to anon,authenticated;
