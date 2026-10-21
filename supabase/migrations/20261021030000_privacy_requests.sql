-- Phase 9: privacy rights intake and owner review queue.
-- This does not erase records automatically: identity and legal holds require review.
create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 kind text not null check(kind in ('access','rectify','erase')),
 status text not null default 'pending' check(status in ('pending','reviewing','closed')),
 owner_note text check(owner_note is null or length(owner_note)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz
);
create unique index privacy_one_open_per_kind
 on public.privacy_requests(booking_id,kind) where status in ('pending','reviewing');
create index privacy_requests_owner_queue on public.privacy_requests(shop_id,status,created_at desc);
alter table public.privacy_requests enable row level security;
create policy "privacy requests owner read" on public.privacy_requests for select to authenticated
  using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
create policy "privacy requests owner update" on public.privacy_requests for update to authenticated
  using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())))
  with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select,update on public.privacy_requests to authenticated;
revoke all on public.privacy_requests from anon;
revoke insert,delete on public.privacy_requests from authenticated;

create or replace function meca_private.guard_privacy_review()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
   or new.booking_id is distinct from old.booking_id
   or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at
 then raise exception 'IMMUTABLE_PRIVACY_REQUEST';end if;
 -- Don't mark closed and then silently reopen. A fresh request can be made.
 if old.status='closed' and new.status<>'closed' then raise exception 'PRIVACY_CLOSED';end if;
 if new.status='closed' then
   new.closed_at:=coalesce(old.closed_at,now());
 else
   new.closed_at:=null;
 end if;
 new.updated_at:=now();
 return new;
end;$$;
revoke all on function meca_private.guard_privacy_review() from public,anon,authenticated;
create trigger guard_privacy_review before update on public.privacy_requests
 for each row execute function meca_private.guard_privacy_review();

create or replace function public.request_booking_privacy_action(
 p_token text,p_kind text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_shop uuid;v_booking uuid;
begin
 if coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
    or p_kind not in ('access','rectify','erase')
 then raise exception 'INVALID_PRIVACY_REQUEST';end if;
 select b.id,b.shop_id into v_booking,v_shop
 from public.bookings b where b.manage_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'INVALID_MANAGEMENT_LINK';end if;
 -- Protect against unbounded repeated requests by the holder of a leaked link.
 perform pg_advisory_xact_lock(hashtext(v_booking::text),hashtext('privacy-request'));
 if (select count(*) from public.privacy_requests p
     where p.booking_id=v_booking and p.created_at>now()-interval '1 day')>=3
 then raise exception 'PRIVACY_REQUEST_LIMIT';end if;
 insert into public.privacy_requests(shop_id,booking_id,kind)
   values(v_shop,v_booking,p_kind)
   on conflict do nothing returning id into v_id;
 if v_id is null then
   select p.id into v_id from public.privacy_requests p
   where p.booking_id=v_booking and p.kind=p_kind and p.status in ('pending','reviewing')
   limit 1;
 end if;
 return v_id;
end;$$;
revoke all on function public.request_booking_privacy_action(text,text) from public;
grant execute on function public.request_booking_privacy_action(text,text) to anon,authenticated;
