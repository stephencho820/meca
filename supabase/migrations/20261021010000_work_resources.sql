-- Phase 7: garage team and lift allocation.
-- Customer self-booking remains capacity based; assignments are made by shop owner.
create table public.work_resources (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('technician','bay')),
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(shop_id,id),
  unique(shop_id,kind,name)
);
create index work_resources_shop_idx on public.work_resources(shop_id,kind,active);
alter table public.work_resources enable row level security;
create policy "resources owner read" on public.work_resources for select to authenticated
  using (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "resources owner insert" on public.work_resources for insert to authenticated
  with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "resources owner update" on public.work_resources for update to authenticated
  using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
  with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select,insert,update on public.work_resources to authenticated;
revoke all on public.work_resources from anon;
revoke delete on public.work_resources from authenticated;

-- Bound the resource row to its originating garage and kind.
create or replace function meca_private.guard_work_resource()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.shop_id is distinct from old.shop_id or new.kind is distinct from old.kind
  then raise exception 'IMMUTABLE_RESOURCE'; end if;
  return new;
end;$$;
revoke all on function meca_private.guard_work_resource() from public,anon,authenticated;
create trigger guard_work_resource before update on public.work_resources
  for each row execute function meca_private.guard_work_resource();

alter table public.bookings add column assigned_technician_id uuid;
alter table public.bookings add column assigned_bay_id uuid;
alter table public.bookings
  add constraint bookings_shop_technician_fk
  foreign key(shop_id,assigned_technician_id) references public.work_resources(shop_id,id);
alter table public.bookings
  add constraint bookings_shop_bay_fk
  foreign key(shop_id,assigned_bay_id) references public.work_resources(shop_id,id);
create index bookings_technician_slot_idx on public.bookings(assigned_technician_id,starts_at,ends_at)
  where assigned_technician_id is not null;
create index bookings_bay_slot_idx on public.bookings(assigned_bay_id,starts_at,ends_at)
  where assigned_bay_id is not null;

-- Validation always runs inside the booking transaction for direct manager
-- writes, including status restoration and customer-driven rescheduling.
-- Resource locks are sorted to avoid deadlocks in concurrent multi-assignment.
create or replace function meca_private.validate_work_resource_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid;v_kind text;
begin
 if new.status not in ('pending','confirmed') then return new; end if;
 if new.assigned_technician_id is null and new.assigned_bay_id is null then return new; end if;
 if new.assigned_technician_id is not null and new.assigned_bay_id = new.assigned_technician_id
 then raise exception 'INVALID_RESOURCE';end if;
 for v_id in select r from unnest(array[new.assigned_technician_id,new.assigned_bay_id]) a(r)
    where r is not null order by r
 loop
   -- Acquire a per-resource transaction lock, even if no competing bookings
   -- existed when the transaction began.
   perform pg_advisory_xact_lock(hashtextextended('meca-resource:'||v_id::text,0));
   select r.kind into v_kind from public.work_resources r
    where r.id=v_id and r.shop_id=new.shop_id and r.active;
   if not found then raise exception 'INVALID_RESOURCE';end if;
   if (v_id=new.assigned_technician_id and v_kind<>'technician')
      or (v_id=new.assigned_bay_id and v_kind<>'bay')
   then raise exception 'INVALID_RESOURCE';end if;
   if exists(select 1 from public.bookings b where b.shop_id=new.shop_id
     and b.id<>new.id and b.status in ('pending','confirmed')
     and b.starts_at<new.ends_at and b.ends_at>new.starts_at
     and (b.assigned_technician_id=v_id or b.assigned_bay_id=v_id))
   then raise exception 'RESOURCE_BUSY';end if;
 end loop;
 return new;
end;$$;
revoke all on function meca_private.validate_work_resource_assignment() from public,anon,authenticated;
create trigger meca_bookings_resource_guard
  after insert or update on public.bookings
  for each row execute function meca_private.validate_work_resource_assignment();

-- An occupied resource cannot be retired: reservation allocation must be
-- cleared before deactivating a technician or lift.
create or replace function meca_private.guard_resource_deactivation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.active and not new.active and exists(
   select 1 from public.bookings b where b.shop_id=new.shop_id
    and b.status in ('pending','confirmed') and b.ends_at>now()
    and (b.assigned_technician_id=new.id or b.assigned_bay_id=new.id)
 ) then raise exception 'RESOURCE_IN_USE';end if;
 return new;
end;$$;
revoke all on function meca_private.guard_resource_deactivation() from public,anon,authenticated;
create trigger meca_resource_deactivation before update on public.work_resources
  for each row execute function meca_private.guard_resource_deactivation();
