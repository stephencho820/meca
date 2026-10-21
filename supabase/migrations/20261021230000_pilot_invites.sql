-- First-shop pilot: private one-time invitation; no public prospect shop until consent.
create table public.pilot_invitations (
  id uuid primary key default gen_random_uuid(),
  prospect_code text not null unique check(prospect_code ~ '^[a-z0-9-]{3,60}$'),
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  shop_name text not null,
  phone text,
  address text,
  expires_at timestamptz not null default now()+interval '45 days',
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  shop_id uuid unique references public.shops(id),
  created_at timestamptz not null default now()
);
alter table public.pilot_invitations enable row level security;
revoke all on public.pilot_invitations from anon,authenticated;
-- Nobody reads private prospects or invitation hashes via Data API.
create table public.pilot_enrollments (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  invitation_id uuid not null unique references public.pilot_invitations(id),
  activated_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pilot_enrollments enable row level security;
create policy "pilot owner read" on public.pilot_enrollments for select to authenticated
  using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select on public.pilot_enrollments to authenticated;
revoke all on public.pilot_enrollments from anon;
revoke insert,update,delete on public.pilot_enrollments from authenticated;

alter table public.shops add column if not exists privacy_policy_url text;
alter table public.shops add constraint meca_privacy_policy_https
  check(privacy_policy_url is null or (length(privacy_policy_url)<=500 and privacy_policy_url ~ '^https://[^[:space:]]+$'));

-- A normal shop cannot be silently replaced by an invitation; enrollment is
-- only possible for a newly-registered user with no existing shop.
create or replace function public.claim_meca_pilot(p_code text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_inv public.pilot_invitations%rowtype;v_shop uuid;v_user uuid;
begin
  v_user:=auth.uid();
  if v_user is null or p_code is null or p_code !~ '^[0-9a-f]{64}$'
  then raise exception 'INVALID_INVITE';end if;
  perform pg_advisory_xact_lock(hashtextextended('meca-pilot-owner:'||v_user::text,0));
  if exists(select 1 from public.shops where owner_id=v_user)
  then raise exception 'OWNER_ALREADY_HAS_SHOP';end if;
  select * into v_inv from public.pilot_invitations
   where token_hash=encode(extensions.digest(p_code,'sha256'),'hex')
     and claimed_at is null and expires_at>now()
   for update;
  if not found then raise exception 'INVALID_INVITE';end if;
  insert into public.shops(owner_id,name,slug,category,phone,address,
    slot_capacity,is_active,description)
  values(v_user,v_inv.shop_name,'pilot-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    '자동차 정비',v_inv.phone,v_inv.address,1,false,
    '매장 운영 정보를 확인하는 무료 파일럿 준비 단계입니다.')
  returning id into v_shop;
  -- Do not invent prices, offered jobs or operating hours for prospects.
  update public.services set price_from=null,approval_required=true,active=false
    where shop_id=v_shop;
  update public.business_hours set is_closed=true where shop_id=v_shop;
  insert into public.pilot_enrollments(shop_id,invitation_id)
    values(v_shop,v_inv.id);
  update public.pilot_invitations
    set claimed_by=v_user,claimed_at=now(),shop_id=v_shop where id=v_inv.id;
  return v_shop;
end;$$;
revoke all on function public.claim_meca_pilot(text) from public,anon;
grant execute on function public.claim_meca_pilot(text) to authenticated;

-- Activation is deliberate, not a side-effect of owner changing shop details.
create or replace function meca_private.guard_pilot_shop_activation()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.is_active and not old.is_active and exists(
   select 1 from public.pilot_enrollments p
     where p.shop_id=new.id and p.activated_at is null
 ) then raise exception 'PILOT_ACTIVATION_REQUIRED';end if;
 return new;
end;$$;
revoke all on function meca_private.guard_pilot_shop_activation() from public,anon,authenticated;
create trigger meca_pilot_activation_guard before update of is_active on public.shops
 for each row execute function meca_private.guard_pilot_shop_activation();

create or replace function public.activate_meca_pilot(
 p_shop_id uuid,p_confirm_details boolean,p_confirm_hours boolean,
 p_confirm_services boolean,p_confirm_privacy boolean
) returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_shop public.shops%rowtype;v_end timestamptz;
begin
 if auth.uid() is null or
    not(coalesce(p_confirm_details,false) and coalesce(p_confirm_hours,false)
      and coalesce(p_confirm_services,false) and coalesce(p_confirm_privacy,false))
 then raise exception 'PILOT_CHECKLIST_INCOMPLETE';end if;
 select * into v_shop from public.shops s
   where s.id=p_shop_id and s.owner_id=auth.uid() for update;
 if not found then raise exception 'PILOT_NOT_OWNER';end if;
 if not exists(select 1 from public.pilot_enrollments p
   where p.shop_id=p_shop_id and p.activated_at is null)
 then raise exception 'PILOT_NOT_PENDING';end if;
 if btrim(coalesce(v_shop.name,''))='' or btrim(coalesce(v_shop.phone,''))=''
    or btrim(coalesce(v_shop.address,''))=''
    or coalesce(v_shop.privacy_policy_url,'') !~ '^https://[^[:space:]]+$'
 then raise exception 'PILOT_DETAILS_INCOMPLETE';end if;
 if not exists(select 1 from public.business_hours h
  where h.shop_id=p_shop_id and not h.is_closed)
 then raise exception 'PILOT_HOURS_MISSING';end if;
 if not exists(select 1 from public.services s
  where s.shop_id=p_shop_id and s.active)
 then raise exception 'PILOT_SERVICES_MISSING';end if;
 if exists(select 1 from public.services s
  where s.shop_id=p_shop_id and s.active and not s.approval_required)
 then raise exception 'PILOT_APPROVAL_REQUIRED';end if;
 update public.pilot_enrollments
   set activated_at=now(),ends_at=now()+interval '30 days'
   where shop_id=p_shop_id returning ends_at into v_end;
 update public.shops set is_active=true where id=p_shop_id;
 return v_end;
end;$$;
revoke all on function public.activate_meca_pilot(uuid,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.activate_meca_pilot(uuid,boolean,boolean,boolean,boolean) to authenticated;

-- Include invitation credential in operator-only SQL, not source-controlled migration.
