-- Customer booking improvements: approval-first and multiple requested services.
-- Preserve existing single-service bookings without rewriting records.
alter table public.bookings add column if not exists selected_service_ids uuid[];
-- A new multi-service booking records a fixed snapshot of requested services.
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
  v_minutes integer;
  v_names text;
  v_check boolean := false;
begin
  if tg_op = 'INSERT' then
    -- All customer web bookings need explicit approval by default, including
    -- older public booking RPC signatures that request confirmed.
    if new.source='web' then new.status:='pending';end if;
    v_check := new.status in ('pending','confirmed');
  else
    if new.shop_id is distinct from old.shop_id
      or new.service_id is distinct from old.service_id
      or new.selected_service_ids is distinct from old.selected_service_ids
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
  then raise exception 'INVALID_BOOKING'; end if;
  if new.selected_service_ids is not null then
    if array_length(new.selected_service_ids,1) not between 1 and 5
       or new.selected_service_ids[1] is distinct from new.service_id
       or (select count(distinct x) from unnest(new.selected_service_ids) x)
           <>array_length(new.selected_service_ids,1)
    then raise exception 'INVALID_BOOKING';end if;
    select sum(svc.duration_minutes)::integer,
      string_agg(svc.name,' + ' order by x.ordinality)
      into v_minutes,v_names
      from unnest(new.selected_service_ids) with ordinality x(id,ordinality)
      join public.services svc on svc.id=x.id and svc.shop_id=new.shop_id and svc.active;
    if v_names is null or
       (select count(*) from unnest(new.selected_service_ids) x join public.services svc
        on svc.id=x and svc.shop_id=new.shop_id and svc.active)
          <>array_length(new.selected_service_ids,1)
    then raise exception 'INVALID_BOOKING';end if;
    new.service_name:=v_names;
  else
    v_minutes:=v_service.duration_minutes;
    new.service_name:=v_service.name;
  end if;
  if v_minutes not between 1 and 480 or
     new.ends_at<>new.starts_at+make_interval(mins=>v_minutes)
  then raise exception 'INVALID_BOOKING';end if;

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
  return new;
end;
$$;
-- Existing client management links must reserve the full combined duration.
create or replace function public.customer_manage_slots(p_token text,p_day date)
returns table(time_label text,available boolean)
language plpgsql security definer set search_path=''
as $$
declare b record;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' or p_day is null
    or p_day < (now() at time zone 'Asia/Seoul')::date
    or p_day > (now() at time zone 'Asia/Seoul')::date + 30 then return; end if;
  select x.id,x.shop_id,x.service_id,x.status,sh.slot_capacity,extract(epoch from (x.ends_at-x.starts_at))/60 as duration_minutes
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
    sh.slot_capacity,extract(epoch from (x.ends_at-x.starts_at))/60 as duration_minutes
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

-- Validate the exact same chosen services and combined time in both listing
-- and checkout. Never trust a total sent by the browser.
create or replace function public.get_available_slots_multi(
 p_shop_slug text,p_service_ids uuid[],p_day date
) returns table(time_label text,available boolean)
language plpgsql security definer set search_path=''
as $$
declare v_shop record;v_minutes integer;v_count integer;
begin
 if p_day is null
   or p_day < (now() at time zone 'Asia/Seoul')::date
   or p_day > (now() at time zone 'Asia/Seoul')::date+30
   or coalesce(array_length(p_service_ids,1),0) not between 1 and 5
   or (select count(distinct x) from unnest(p_service_ids) x)<>array_length(p_service_ids,1)
 then return;end if;
 select id,slot_capacity into v_shop from public.shops
  where slug=p_shop_slug and is_active;
 if not found then return;end if;
 select count(*),sum(duration_minutes)::integer into v_count,v_minutes
 from public.services where shop_id=v_shop.id and id=any(p_service_ids) and active;
 if v_count<>array_length(p_service_ids,1) or v_minutes not between 1 and 480
 then return;end if;
 if exists(select 1 from public.blocked_dates
   where shop_id=v_shop.id and blocked_date=p_day) then return;end if;
 return query
 select to_char(t.starts_at at time zone 'Asia/Seoul','HH24:MI'),
   t.starts_at>=now()+interval '1 hour'
   and meca_private.has_capacity(
     v_shop.id,t.starts_at,t.starts_at+make_interval(mins=>v_minutes),
     v_shop.slot_capacity,null)
 from public.business_hours h
 cross join lateral generate_series(
  (p_day+h.open_time) at time zone 'Asia/Seoul',
  (p_day+h.close_time-make_interval(mins=>v_minutes)) at time zone 'Asia/Seoul',
  interval '30 minutes') t(starts_at)
 where h.shop_id=v_shop.id and not h.is_closed
  and h.day_of_week=extract(dow from p_day)::integer
 order by t.starts_at;
end;$$;
revoke all on function public.get_available_slots_multi(text,uuid[],date) from public;
grant execute on function public.get_available_slots_multi(text,uuid[],date) to anon,authenticated;

-- Direct anonymous RPC is intentionally still quota-controlled at DB layer.
create or replace function public.create_public_booking_multi(
 p_shop_slug text,p_service_ids uuid[],p_day date,p_time text,
 p_customer_name text,p_customer_phone text,
 p_vehicle_model text default '',p_notes text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_shop uuid;v_n integer;v_minutes integer;
 v_start timestamptz;v_id uuid;v_token text;
begin
 if coalesce(array_length(p_service_ids,1),0) not between 1 and 5
   or (select count(distinct x) from unnest(p_service_ids) x)<>array_length(p_service_ids,1)
   or coalesce(p_time,'') !~ '^([01][0-9]|2[0-3]):(00|30)$'
   or p_day is null or length(btrim(coalesce(p_customer_name,''))) not between 1 and 80
   or coalesce(p_customer_phone,'') !~ '^01[0-9]{8,9}$'
   or length(coalesce(p_vehicle_model,''))>100 or length(coalesce(p_notes,''))>500
 then raise exception 'INVALID_BOOKING';end if;
 select id into v_shop from public.shops where slug=p_shop_slug and is_active;
 if not found then raise exception 'INVALID_BOOKING';end if;
 select count(*),sum(duration_minutes)::integer into v_n,v_minutes
 from public.services where shop_id=v_shop and active and id=any(p_service_ids);
 if v_n<>array_length(p_service_ids,1) or v_minutes not between 1 and 480
 then raise exception 'INVALID_BOOKING';end if;
 perform pg_advisory_xact_lock(hashtext(v_shop::text),
    hashtext('booking-phone:'||p_customer_phone));
 if (select count(*) from public.bookings b
  where b.shop_id=v_shop and b.customer_phone=p_customer_phone
    and b.source='web' and b.created_at>now()-interval '1 hour')>=4
 or (select count(*) from public.bookings b
  where b.shop_id=v_shop and b.customer_phone=p_customer_phone
    and b.source='web' and b.created_at>now()-interval '1 day')>=8
 then raise exception 'BOOKING_RATE_LIMIT';end if;
 perform pg_advisory_xact_lock(hashtext(v_shop::text),hashtext(p_day::text));
 if not exists(select 1 from public.get_available_slots_multi(p_shop_slug,p_service_ids,p_day) a
    where a.time_label=p_time and a.available)
 then raise exception 'SLOT_UNAVAILABLE';end if;
 v_start:=(p_day+p_time::time) at time zone 'Asia/Seoul';
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.bookings(
  shop_id,service_id,service_name,selected_service_ids,
  customer_name,customer_phone,vehicle_model,notes,starts_at,ends_at,
  status,source,privacy_consented_at,manage_token_hash)
 values(
  v_shop,p_service_ids[1],'',p_service_ids,
  btrim(p_customer_name),p_customer_phone,
  nullif(btrim(p_vehicle_model),''),nullif(btrim(p_notes),''),
  v_start,v_start+make_interval(mins=>v_minutes),
  'pending','web',now(),
  encode(extensions.digest(v_token,'sha256'),'hex'))
 returning id into v_id;
 return jsonb_build_object('booking_id',v_id,'manage_token',v_token);
end;$$;
revoke all on function public.create_public_booking_multi(text,uuid[],date,text,text,text,text,text) from public;
grant execute on function public.create_public_booking_multi(text,uuid[],date,text,text,text,text,text) to anon,authenticated;
