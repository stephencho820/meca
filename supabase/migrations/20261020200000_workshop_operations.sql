-- Phase 5: separate repair work lifecycle from booking status.
-- Keep existing customer bookings and owner RLS policies intact.
alter table public.bookings
  add column if not exists work_stage text not null default 'scheduled',
  add column if not exists internal_note text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists work_ready_at timestamptz,
  add column if not exists handed_over_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bookings drop constraint if exists bookings_work_stage_check;
alter table public.bookings add constraint bookings_work_stage_check
  check(work_stage in ('scheduled','checked_in','working','ready','handed_over'));
alter table public.bookings drop constraint if exists bookings_internal_note_length;
alter table public.bookings add constraint bookings_internal_note_length
  check(internal_note is null or length(internal_note)<=2000);

create or replace function meca_private.booking_workflow_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    new.work_stage := 'scheduled';
    new.updated_at := now();
    return new;
  end if;
  if new.work_stage is distinct from old.work_stage then
    -- Already closed reservations cannot be checked into the workshop.
    if old.status in ('cancelled','completed') then
      raise exception 'WORKFLOW_CLOSED';
    end if;
    if new.status='cancelled' then raise exception 'WORKFLOW_CLOSED'; end if;
    if new.work_stage='checked_in' and old.work_stage<>'checked_in' then
      new.checked_in_at := coalesce(old.checked_in_at,now());
    elsif new.work_stage='working' and old.work_stage<>'working' then
      new.work_started_at := coalesce(old.work_started_at,now());
      new.checked_in_at := coalesce(old.checked_in_at,now());
    elsif new.work_stage='ready' and old.work_stage<>'ready' then
      new.work_ready_at := coalesce(old.work_ready_at,now());
      new.work_started_at := coalesce(old.work_started_at,now());
      new.checked_in_at := coalesce(old.checked_in_at,now());
    elsif new.work_stage='handed_over' then
      new.handed_over_at := coalesce(old.handed_over_at,now());
      new.work_ready_at := coalesce(old.work_ready_at,now());
      new.work_started_at := coalesce(old.work_started_at,now());
      new.checked_in_at := coalesce(old.checked_in_at,now());
      new.status := 'completed';
    end if;
    -- Arrival means the booking has been accepted (and already reserves capacity).
    if new.work_stage<>'scheduled' and new.status='pending' then new.status:='confirmed'; end if;
  end if;
  -- Existing completed and cancelled reservations remain visible for history.
  -- Prevent changing the time of completed or cancelled bookings.
  if old.status in ('completed','cancelled')
     and (new.starts_at is distinct from old.starts_at
       or new.service_id is distinct from old.service_id)
  then raise exception 'BOOKING_CLOSED'; end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function meca_private.booking_workflow_guard() from public,anon,authenticated;
drop trigger if exists meca_bookings_workflow on public.bookings;
create trigger meca_bookings_workflow before insert or update on public.bookings
for each row execute function meca_private.booking_workflow_guard();

-- Revalidate all changed services in the established occupancy guard.
-- The shop ownership/identity stays immutable; authorized managers may change
-- a repair service if its duration and the new interval fit within capacity.
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
    then
      raise exception 'IMMUTABLE_BOOKING';
    end if;
    -- Rescheduling active bookings must repeat the capacity check.
    v_check := new.status in ('pending','confirmed')
      and (old.status not in ('pending','confirmed')
        or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
        or new.service_id is distinct from old.service_id);
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




-- Slot-occupying statuses are still checked by the existing capacity guard.
-- The workflow is owner-only through the bookings' existing RLS update policy.
create index if not exists bookings_shop_work_stage_idx
  on public.bookings(shop_id,work_stage,starts_at);
