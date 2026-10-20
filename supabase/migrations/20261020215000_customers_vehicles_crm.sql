-- Phase 6: shop-isolated customer and vehicle CRM with booking history linkage.
-- No old bookings are deleted. This migration is additive.
create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 phone text not null check(phone ~ '^01[0-9]{8,9}$'),
 internal_note text check(internal_note is null or length(internal_note)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(shop_id,id),
 unique(shop_id,phone)
);

create table if not exists public.vehicles (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 customer_id uuid not null,
 model text not null check(length(btrim(model)) between 1 and 100),
 plate text check(plate is null or (length(plate) between 4 and 20 and plate !~ '[[:space:]]')),
 model_year integer check(model_year is null or model_year between 1950 and 2100),
 odometer_km integer check(odometer_km is null or odometer_km between 0 and 5000000),
 internal_note text check(internal_note is null or length(internal_note)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(shop_id,customer_id) references public.customers(shop_id,id),
 unique(shop_id,id)
);
create unique index if not exists vehicles_shop_plate_key on public.vehicles(shop_id,plate) where plate is not null;
-- Anonymous bookings only identify a model, not a specific car. Don't create
-- redundant placeholder vehicles when the same customer repeats a model.
create unique index if not exists vehicles_customer_unplated_model_key
  on public.vehicles(shop_id,customer_id,model) where plate is null;

alter table public.bookings add column if not exists customer_id uuid;
alter table public.bookings add column if not exists vehicle_id uuid;
alter table public.bookings add constraint bookings_customer_shop_fk
  foreign key(shop_id,customer_id) references public.customers(shop_id,id);
alter table public.bookings add constraint bookings_vehicle_shop_fk
  foreign key(shop_id,vehicle_id) references public.vehicles(shop_id,id);
create index if not exists bookings_shop_customer_idx on public.bookings(shop_id,customer_id,starts_at desc);
create index if not exists bookings_shop_vehicle_idx on public.bookings(shop_id,vehicle_id,starts_at desc);

alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
create policy "customers owner select" on public.customers for select to authenticated
 using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "customers owner insert" on public.customers for insert to authenticated
 with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "customers owner update" on public.customers for update to authenticated
 using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "vehicles owner select" on public.vehicles for select to authenticated
 using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "vehicles owner insert" on public.vehicles for insert to authenticated
 with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "vehicles owner update" on public.vehicles for update to authenticated
 using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select,insert,update on public.customers,public.vehicles to authenticated;
revoke all on public.customers,public.vehicles from anon;
revoke delete on public.customers,public.vehicles from authenticated;

-- Prevent switching a vehicle to another shop/customer in a direct table update.
-- Phone is a stable per-shop customer identity, edited through reservation intake.
create or replace function meca_private.crm_owner_edit_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.shop_id is distinct from old.shop_id then raise exception 'CRM_IMMUTABLE_SHOP'; end if;
 if tg_table_name='vehicles' and new.customer_id is distinct from old.customer_id
 then raise exception 'CRM_IMMUTABLE_OWNER'; end if;
 if tg_table_name='customers' and new.phone is distinct from old.phone
 then raise exception 'CRM_IMMUTABLE_PHONE'; end if;
 new.updated_at:=now();
 return new;
end;$$;
revoke all on function meca_private.crm_owner_edit_guard() from public,anon,authenticated;
create trigger customers_owner_edit_guard before update on public.customers
 for each row execute function meca_private.crm_owner_edit_guard();
create trigger vehicles_owner_edit_guard before update on public.vehicles
 for each row execute function meca_private.crm_owner_edit_guard();

-- This trigger runs on every real booking insertion and when the caller changes
-- contact / vehicle_model. It resolves shop-specific identities, ignoring any
-- arbitrary ID the caller supplied. Direct anonymous booking access stays revoked.
create or replace function meca_private.booking_crm_sync()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_customer uuid;v_vehicle uuid;v_model text;v_hits integer;
begin
  if tg_op='UPDATE' and new.shop_id is distinct from old.shop_id
  then raise exception 'IMMUTABLE_BOOKING'; end if;
  if tg_op='UPDATE' and new.customer_name is not distinct from old.customer_name
    and new.customer_phone is not distinct from old.customer_phone
    and new.vehicle_model is not distinct from old.vehicle_model
    and old.customer_id is not null
    and (nullif(btrim(coalesce(new.vehicle_model,'')),'') is null or old.vehicle_id is not null)
  then
    -- Prevent arbitrary reassignment of customer/vehicle IDs by table clients.
    new.customer_id:=old.customer_id;new.vehicle_id:=old.vehicle_id;
    return new;
  end if;
  if coalesce(new.customer_phone,'') !~ '^01[0-9]{8,9}$'
     or length(btrim(coalesce(new.customer_name,''))) not between 1 and 80
  then raise exception 'INVALID_CUSTOMER'; end if;
  insert into public.customers(shop_id,name,phone)
    values(new.shop_id,btrim(new.customer_name),new.customer_phone)
    on conflict(shop_id,phone) do update
      set name=excluded.name,updated_at=now()
    returning id into v_customer;
  new.customer_id:=v_customer;
  new.vehicle_id:=null;
  v_model:=nullif(btrim(coalesce(new.vehicle_model,'')),'');
  if v_model is null then return new; end if;
  if length(v_model)>100 then raise exception 'INVALID_VEHICLE'; end if;
  -- Link to an existing car only when its model matches unambiguously.
  select min(v.id),count(*) into v_vehicle,v_hits
    from public.vehicles v where v.shop_id=new.shop_id
      and v.customer_id=v_customer and v.model=v_model;
  if v_hits=1 then new.vehicle_id:=v_vehicle;return new;end if;
  -- No record or ambiguous model: attach/create a plate-less generic vehicle.
  insert into public.vehicles(shop_id,customer_id,model)
    values(new.shop_id,v_customer,v_model)
    on conflict(shop_id,customer_id,model) where plate is null
      do update set model=excluded.model
    returning id into v_vehicle;
  new.vehicle_id:=v_vehicle;
  return new;
end;$$;
revoke all on function meca_private.booking_crm_sync() from public,anon,authenticated;
create trigger meca_booking_crm_sync before insert or update on public.bookings
  for each row execute function meca_private.booking_crm_sync();

-- Preserve existing reservations while linking their historical contact details.
-- None of the booking times, statuses or service information are modified.
update public.bookings set customer_name=customer_name
 where customer_id is null;
