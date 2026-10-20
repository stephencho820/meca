-- MECA — initial schema. Execute in a dedicated Supabase project for MECA.
-- All exposed public tables have RLS enabled and per-shop owner policies.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  category text not null default '자동차 정비',
  phone text,
  address text,
  description text,
  primary_color text not null default '#c5f48a',
  slot_capacity integer not null default 1 check (slot_capacity between 1 and 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists shops_owner_idx on public.shops(owner_id);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 30 and 480),
  price_from integer check (price_from is null or price_from >= 0),
  icon text not null default '🔧',
  approval_required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(shop_id,id)
);
create index if not exists services_shop_idx on public.services(shop_id,sort_order);

create table if not exists public.business_hours (
  shop_id uuid not null references public.shops(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time not null default '09:00',
  close_time time not null default '18:00',
  is_closed boolean not null default false,
  primary key(shop_id,day_of_week),
  check (open_time < close_time)
);
create table if not exists public.blocked_dates (
  shop_id uuid not null references public.shops(id) on delete cascade,
  blocked_date date not null,
  reason text,
  primary key (shop_id,blocked_date)
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_id uuid,
  service_name text not null,
  customer_name text not null check(length(customer_name) between 1 and 80),
  customer_phone text not null check(customer_phone ~ '^01[0-9]{8,9}$'),
  vehicle_model text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  source text not null default 'web' check (source in ('web','manual')),
  privacy_consented_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (shop_id,service_id) references public.services(shop_id,id),
  check(ends_at>starts_at)
);
create index if not exists bookings_shop_time_idx on public.bookings(shop_id,starts_at);
create index if not exists bookings_shop_status_idx on public.bookings(shop_id,status);

alter table public.shops enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.bookings enable row level security;

-- Publicly listed active shops, and own inactive shops
create policy "shops read public or own" on public.shops for select to anon,authenticated
using (is_active or owner_id=(select auth.uid()));
create policy "shops insert own" on public.shops for insert to authenticated
with check (owner_id=(select auth.uid()));
create policy "shops update own" on public.shops for update to authenticated
using (owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "shops delete own" on public.shops for delete to authenticated
using (owner_id=(select auth.uid()));

create policy "services read public or own" on public.services for select to anon,authenticated
using (exists(select 1 from public.shops s where s.id=shop_id and (s.is_active or s.owner_id=(select auth.uid()))));
create policy "services insert own" on public.services for insert to authenticated
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "services update own" on public.services for update to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "services delete own" on public.services for delete to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));

create policy "hours read" on public.business_hours for select to anon,authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and (s.is_active or s.owner_id=(select auth.uid()))));
create policy "hours insert own" on public.business_hours for insert to authenticated
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "hours update own" on public.business_hours for update to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "hours delete own" on public.business_hours for delete to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));

create policy "blocked dates read" on public.blocked_dates for select to anon,authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and (s.is_active or s.owner_id=(select auth.uid()))));
create policy "blocked dates insert own" on public.blocked_dates for insert to authenticated
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "blocked dates update own" on public.blocked_dates for update to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "blocked dates delete own" on public.blocked_dates for delete to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));

-- Customer PII never exposed to public browsers via table SELECT.
create policy "bookings owners read" on public.bookings for select to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "bookings owners insert" on public.bookings for insert to authenticated
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "bookings owners update" on public.bookings for update to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "bookings owners delete" on public.bookings for delete to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));

-- Owner signup seeds workable default hours and services.
create or replace function public.seed_meca_shop() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.business_hours(shop_id,day_of_week,open_time,close_time,is_closed)
  select new.id, d, '09:00'::time, case when d=6 then '16:00'::time else '18:00'::time end, d=0
  from generate_series(0,6) as d;
  insert into public.services(shop_id,name,description,duration_minutes,price_from,icon,approval_required,sort_order)
  values
  (new.id,'엔진오일 교환','차량에 맞는 엔진오일 및 필터 교환',60,65000,'🛢️',false,1),
  (new.id,'타이어 점검 / 교체','마모도 점검 및 교체',60,40000,'🛞',false,2),
  (new.id,'브레이크 점검','제동 시스템 점검',90,40000,'🔧',false,3),
  (new.id,'배터리 점검 / 교체','배터리 상태 점검과 교체',40,20000,'🔋',false,4),
  (new.id,'고장 진단 / 일반 정비','차량 이상 증상 상담',60,null,'🚘',true,5);
  return new;
end; $$;
revoke all on function public.seed_meca_shop() from public,anon,authenticated;
create trigger meca_shops_seed_defaults after insert on public.shops
for each row execute function public.seed_meca_shop();

-- Returns only time + availability, never booking or customer details.
create or replace function public.get_available_slots(
 p_shop_slug text,p_service_id uuid,p_day date
) returns table(time_label text,available boolean)
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  if p_day < (now() at time zone 'Asia/Seoul')::date
     or p_day > (now() at time zone 'Asia/Seoul')::date + 30 then return; end if;
  select sh.id as shop_id, sh.slot_capacity, svc.duration_minutes
  into s from public.shops sh join public.services svc on svc.shop_id=sh.id
  where sh.slug=p_shop_slug and sh.is_active and svc.id=p_service_id and svc.active;
  if not found then return; end if;
  if exists(select 1 from public.blocked_dates d where d.shop_id=s.shop_id and d.blocked_date=p_day) then return; end if;
  return query
  select to_char(slot.slot_start at time zone 'Asia/Seoul','HH24:MI') as time_label,
    (slot.slot_start >= now()+interval '1 hour'
      and (select count(*) from public.bookings b
        where b.shop_id=s.shop_id and b.status in ('pending','confirmed')
        and b.starts_at < slot.slot_start+make_interval(mins=>s.duration_minutes)
        and b.ends_at > slot.slot_start) < s.slot_capacity
    ) as available
  from public.business_hours h
  cross join lateral generate_series(
    (p_day+h.open_time) at time zone 'Asia/Seoul',
    (p_day+h.close_time-make_interval(mins=>s.duration_minutes)) at time zone 'Asia/Seoul',
    interval '30 minutes'
  ) as slot(slot_start)
  where h.shop_id=s.shop_id and h.day_of_week=extract(dow from p_day)::int and not h.is_closed
  order by slot.slot_start;
end; $$;

-- One atomic transaction + per-shop/day advisory lock prevents double booking
-- across simultaneous public submissions.
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

-- Explicit, narrow public entry points. SECURITY DEFINER functions perform their
-- own validation, and caller roles cannot SELECT customers' booking records.
revoke all on function public.get_available_slots(text,uuid,date) from public;
revoke all on function public.create_public_booking(text,uuid,date,text,text,text,text,text) from public;
grant execute on function public.get_available_slots(text,uuid,date) to anon, authenticated;
grant execute on function public.create_public_booking(text,uuid,date,text,text,text,text,text) to anon, authenticated;
-- PostgREST table grants (RLS still determines accessible rows).
grant select on public.shops,public.services,public.business_hours,public.blocked_dates to anon;
grant select,insert,update,delete on public.shops,public.services,public.business_hours,public.blocked_dates,public.bookings to authenticated;
-- No direct anonymous write access to tables, including bookings.
revoke all on public.bookings from anon;
