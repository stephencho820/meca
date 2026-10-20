-- MECA Phase 2: booking integrity, concurrent capacity and realtime notifications.
-- Backwards-compatible: no table/data drops, no change to customer data.
create schema if not exists meca_private;
revoke all on schema meca_private from public, anon, authenticated;

-- For a proposed interval, check concurrency at EVERY boundary, not
-- just the number of bookings overlapping that whole interval.
-- This avoids false positives when sequential jobs never overlap one another.
create or replace function meca_private.has_capacity(
  p_shop uuid, p_start timestamptz, p_end timestamptz,
  p_capacity integer, p_ignore uuid default null
) returns boolean language sql stable security definer set search_path = ''
as $$
  select p_capacity > 0 and p_end > p_start and not exists (
    select 1
    from (
      select p_start as instant
      union
      select b.starts_at from public.bookings b
        where b.shop_id = p_shop
          and b.status in ('pending','confirmed')
          and b.id is distinct from p_ignore
          and b.starts_at < p_end and b.ends_at > p_start
    ) boundaries
    where (
      select count(*) from public.bookings b
      where b.shop_id = p_shop
        and b.status in ('pending','confirmed')
        and b.id is distinct from p_ignore
        and b.starts_at <= boundaries.instant and b.ends_at > boundaries.instant
        and b.starts_at < p_end and b.ends_at > p_start
    ) >= p_capacity
  );
$$;
revoke all on function meca_private.has_capacity(uuid,timestamptz,timestamptz,integer,uuid) from public,anon,authenticated;

-- Direct authenticated table inserts (telephone / walk-in reservations) must
-- respect the same capacity as public RPC submissions, even with concurrent requests.
-- Reopening a cancelled/completed booking is also checked.
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
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
    then
      raise exception 'IMMUTABLE_BOOKING';
    end if;
    v_check := new.status in ('pending','confirmed')
      and old.status not in ('pending','confirmed');
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
drop trigger if exists meca_bookings_guard on public.bookings;
create trigger meca_bookings_guard
  before insert or update on public.bookings
  for each row execute function meca_private.guard_booking();

-- An availability result contains only time labels and boolean availability.
-- All PII continues to be invisible to unauthenticated clients.
create or replace function public.get_available_slots(
 p_shop_slug text,p_service_id uuid,p_day date
) returns table(time_label text,available boolean)
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  if p_day is null
    or p_day < (now() at time zone 'Asia/Seoul')::date
    or p_day > (now() at time zone 'Asia/Seoul')::date + 30
  then return; end if;
  select sh.id as shop_id,sh.slot_capacity,svc.duration_minutes
    into s from public.shops sh
    join public.services svc on svc.shop_id=sh.id
  where sh.slug=p_shop_slug and sh.is_active
    and svc.id=p_service_id and svc.active;
  if not found then return; end if;
  if exists (select 1 from public.blocked_dates d
             where d.shop_id=s.shop_id and d.blocked_date=p_day)
  then return; end if;
  return query
  select to_char(slot.slot_start at time zone 'Asia/Seoul','HH24:MI') as time_label,
    (
      slot.slot_start >= now() + interval '1 hour'
      and meca_private.has_capacity(
        s.shop_id, slot.slot_start,
        slot.slot_start + make_interval(mins=>s.duration_minutes),
        s.slot_capacity, null
      )
    ) as available
  from public.business_hours h
  cross join lateral generate_series(
    (p_day + h.open_time) at time zone 'Asia/Seoul',
    (p_day + h.close_time - make_interval(mins=>s.duration_minutes)) at time zone 'Asia/Seoul',
    interval '30 minutes'
  ) as slot(slot_start)
  where h.shop_id=s.shop_id and not h.is_closed
    and h.day_of_week=extract(dow from p_day)::integer
  order by slot.slot_start;
end;
$$;

-- Trigger-side protection is in place even when an authenticated manager
-- writes directly. Keep the public booking RPC and its limited grants.
-- Publish booking changes only: Realtime subscription remains owner-scoped
-- through the bookings RLS select policy.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='bookings'
    )
  then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;
