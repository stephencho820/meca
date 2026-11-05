-- Phase 16: audited platform operator access. This migration does NOT create an operator account.
-- Assign an existing, verified auth.users ID in a private, manual SQL operation.
create table if not exists meca_private.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);
alter table meca_private.platform_operators enable row level security;
revoke all on meca_private.platform_operators from public, anon, authenticated;

alter table public.shops
  add column if not exists platform_suspended boolean not null default false;

create table if not exists meca_private.platform_shop_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  shop_name text not null,
  actor_id uuid references auth.users(id) on delete set null,
  previous_suspended boolean not null,
  suspended boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_shop_audit_recent_idx
  on meca_private.platform_shop_audit(created_at desc);
alter table meca_private.platform_shop_audit enable row level security;
revoke all on meca_private.platform_shop_audit from public, anon, authenticated;

-- No platform-wide RLS policy on bookings/customers: privileged read functions
-- expose only the minimum per-shop operational aggregates.
create or replace function public.meca_is_operator()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from meca_private.platform_operators p
     where p.user_id = (select auth.uid())
  );
$$;
revoke all on function public.meca_is_operator() from public, anon, authenticated;
grant execute on function public.meca_is_operator() to authenticated;

-- Prevent an owner from undoing an operator suspension through the shops API.
-- Suspended accounts cannot delete/recreate their shop under the same user ID.
create or replace function meca_private.guard_platform_shop()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.platform_suspended then
      raise exception 'PLATFORM_STATUS_FORBIDDEN' using errcode='42501';
    end if;
    if exists (
      select 1 from public.shops s
       where s.owner_id=new.owner_id and s.platform_suspended
    ) then
      raise exception 'PLATFORM_OWNER_SUSPENDED' using errcode='42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.platform_suspended then
      raise exception 'PLATFORM_SUSPENDED' using errcode='42501';
    end if;
    return old;
  end if;

  if new.platform_suspended is distinct from old.platform_suspended then
    if v_actor is null or not exists (
      select 1 from meca_private.platform_operators p where p.user_id=v_actor
    ) then
      raise exception 'PLATFORM_STATUS_FORBIDDEN' using errcode='42501';
    end if;
    -- All suspension changes are logged, even if an operator modifies their
    -- own shop with a direct PostgREST update.
    insert into meca_private.platform_shop_audit
      (shop_id,shop_name,actor_id,previous_suspended,suspended,reason)
    values
      (old.id,old.name,v_actor,old.platform_suspended,new.platform_suspended,
       left(coalesce(nullif(btrim(current_setting('meca.platform_reason',true)),''),
         '운영자 직접 변경'),240));
  end if;
  if new.platform_suspended and new.is_active then
    raise exception 'PLATFORM_SUSPENDED' using errcode='42501';
  end if;
  -- Reopening a suspended shop is a separate, deliberate owner action AFTER
  -- the operator has cleared its suspension.
  if old.platform_suspended and new.is_active then
    raise exception 'PLATFORM_REACTIVATION_REQUIRES_REVIEW' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function meca_private.guard_platform_shop() from public, anon, authenticated;
drop trigger if exists meca_platform_shop_guard on public.shops;
create trigger meca_platform_shop_guard
before insert or update or delete on public.shops
for each row execute function meca_private.guard_platform_shop();

create or replace function public.meca_admin_shops()
returns table (
  shop_id uuid, shop_name text, slug text, owner_email text,
  is_active boolean, platform_suspended boolean, created_at timestamptz,
  pilot_activated_at timestamptz, pilot_ends_at timestamptz,
  bookings_total bigint, bookings_pending bigint, latest_booking_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.meca_is_operator() then
    raise exception 'MECA_ADMIN_FORBIDDEN' using errcode='42501';
  end if;
  return query
    select s.id, s.name, s.slug, u.email,
           s.is_active, s.platform_suspended, s.created_at,
           pe.activated_at, pe.ends_at,
           stats.total, stats.pending, stats.latest
      from public.shops s
      left join auth.users u on u.id=s.owner_id
      left join public.pilot_enrollments pe on pe.shop_id=s.id
      cross join lateral (
        select count(*) as total,
               count(*) filter (where b.status='pending') as pending,
               max(b.created_at) as latest
          from public.bookings b where b.shop_id=s.id
      ) stats
      order by s.created_at desc, s.id
      limit 250;
end;
$$;
revoke all on function public.meca_admin_shops() from public, anon, authenticated;
grant execute on function public.meca_admin_shops() to authenticated;

create or replace function public.meca_admin_shop_audit()
returns table (
  audit_id uuid, shop_id uuid, shop_name text, action text,
  reason text, operator_email text, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.meca_is_operator() then
    raise exception 'MECA_ADMIN_FORBIDDEN' using errcode='42501';
  end if;
  return query
    select a.id, a.shop_id, a.shop_name,
           case when a.suspended then 'suspended' else 'released' end::text,
           a.reason, u.email, a.created_at
      from meca_private.platform_shop_audit a
      left join auth.users u on u.id=a.actor_id
      order by a.created_at desc, a.id desc
      limit 100;
end;
$$;
revoke all on function public.meca_admin_shop_audit() from public, anon, authenticated;
grant execute on function public.meca_admin_shop_audit() to authenticated;

create or replace function public.meca_admin_set_shop_suspension(
  p_shop_id uuid, p_suspend boolean, p_reason text
) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare v_shop public.shops%rowtype;
begin
  if not public.meca_is_operator() then
    raise exception 'MECA_ADMIN_FORBIDDEN' using errcode='42501';
  end if;
  if p_shop_id is null or p_suspend is null
      or length(btrim(coalesce(p_reason,''))) not between 5 and 240 then
    raise exception 'INVALID_PLATFORM_ACTION';
  end if;
  select * into v_shop from public.shops where id=p_shop_id for update;
  if not found then raise exception 'SHOP_NOT_FOUND'; end if;
  if v_shop.platform_suspended = p_suspend then return p_suspend; end if;
  perform set_config('meca.platform_reason', btrim(p_reason), true);
  update public.shops
     set platform_suspended=p_suspend,
         is_active=case when p_suspend then false else is_active end
   where id=p_shop_id;
  return p_suspend;
end;
$$;
revoke all on function public.meca_admin_set_shop_suspension(uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.meca_admin_set_shop_suspension(uuid,boolean,text)
  to authenticated;
