-- Phase 15: owner-only, opt-in mobile Web Push subscriptions and booking event queue.
-- No phone numbers, customer names, or booking tokens are stored in push records.
-- Worker secret hash is populated out-of-band; migration never embeds a credential.
create table if not exists meca_private.owner_push_worker_config(
  id integer primary key check(id=1),
  token_hash text check(token_hash ~ '^[a-f0-9]{64}$')
);
insert into meca_private.owner_push_worker_config(id,token_hash)
values(1,null) on conflict(id) do nothing;
revoke all on meca_private.owner_push_worker_config from public,anon,authenticated;

create table public.owner_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(char_length(endpoint) between 32 and 2048 and endpoint like 'https://%'),
 endpoint_hash text not null check(endpoint_hash ~ '^[a-f0-9]{64}$'),
 p256dh text not null check(char_length(p256dh) between 80 and 120),
 auth_secret text not null check(char_length(auth_secret) between 16 and 64),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(shop_id,endpoint_hash)
);
create index owner_push_owner_idx on public.owner_push_subscriptions(owner_id,shop_id);
alter table public.owner_push_subscriptions enable row level security;
create policy "owner push subscriptions select" on public.owner_push_subscriptions
 for select to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
create policy "owner push subscriptions insert" on public.owner_push_subscriptions
 for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
create policy "owner push subscriptions update" on public.owner_push_subscriptions
 for update to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 )) with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
create policy "owner push subscriptions delete" on public.owner_push_subscriptions
 for delete to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
revoke all on public.owner_push_subscriptions from anon,authenticated;
grant select,insert,update,delete on public.owner_push_subscriptions to authenticated;

create table public.owner_push_outbox (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 event_type text not null check(event_type in ('requested','rescheduled','cancelled')),
 starts_at timestamptz not null,
 status text not null default 'pending'
   check(status in ('pending','processing','submitted','retry','failed','skipped','uncertain')),
 attempts int not null default 0 check(attempts between 0 and 3),
 due_at timestamptz not null default now(),
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index owner_push_due_idx on public.owner_push_outbox(due_at,created_at)
 where status in ('pending','retry');
create index owner_push_shop_idx on public.owner_push_outbox(shop_id,created_at desc);
alter table public.owner_push_outbox enable row level security;
create policy "owner push outbox read" on public.owner_push_outbox
 for select to authenticated using(exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
revoke all on public.owner_push_outbox from anon,authenticated;
grant select on public.owner_push_outbox to authenticated;

create or replace function meca_private.queue_owner_push()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_event text;
begin
 if new.source is distinct from 'web' then return null;end if;
 if tg_op='INSERT' then
   if new.status in ('pending','confirmed') then v_event:='requested';end if;
 elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
   v_event:='cancelled';
 elsif new.status in ('pending','confirmed') and new.starts_at is distinct from old.starts_at then
   v_event:='rescheduled';
 end if;
 if v_event is not null then
   insert into public.owner_push_outbox(shop_id,booking_id,event_type,starts_at)
   values(new.shop_id,new.id,v_event,new.starts_at);
 end if;
 return null;
end;$$;
revoke all on function meca_private.queue_owner_push() from public,anon,authenticated;
create trigger meca_queue_owner_push after insert or update on public.bookings
 for each row execute function meca_private.queue_owner_push();

-- A dedicated 256-bit internal worker credential has access ONLY to push jobs
-- and subscriptions, not to general shop/customer records.
create or replace function meca_private.owner_push_authorized(p_token text)
returns boolean language sql stable security definer set search_path=''
as $$
select coalesce(
  p_token ~ '^[a-f0-9]{64}$'
  and exists(
    select 1 from meca_private.owner_push_worker_config c
    where c.id=1 and c.token_hash is not null
    and c.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
  ),false);
$$;
revoke all on function meca_private.owner_push_authorized(text) from public,anon,authenticated;

create or replace function public.owner_push_worker_ready(p_token text)
returns boolean language sql stable security definer set search_path=''
as $$
select meca_private.owner_push_authorized(p_token);
$$;
revoke all on function public.owner_push_worker_ready(text) from public,anon,authenticated;
grant execute on function public.owner_push_worker_ready(text) to anon;

create or replace function public.claim_owner_push_jobs(
 p_token text,p_booking_id uuid default null,p_limit integer default 10
) returns setof public.owner_push_outbox
language plpgsql security definer set search_path=''
as $$
begin
 if not meca_private.owner_push_authorized(p_token) then
   raise exception 'PUSH_UNAUTHORIZED';
 end if;
 return query
 with due as(
  select j.id from public.owner_push_outbox j
  where j.status in ('pending','retry')
    and j.due_at<=now() and j.attempts<3
    and (p_booking_id is null or j.booking_id=p_booking_id)
  order by j.due_at,j.created_at
  limit least(greatest(coalesce(p_limit,10),1),20)
  for update skip locked
 )
 update public.owner_push_outbox j
  set status='processing',attempts=j.attempts+1,updated_at=now()
 from due where j.id=due.id
 returning j.*;
end;$$;
revoke all on function public.claim_owner_push_jobs(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_owner_push_jobs(text,uuid,integer) to anon;

create or replace function public.owner_push_targets(p_token text,p_shop_id uuid)
returns table(id uuid,endpoint text,p256dh text,auth_secret text)
language plpgsql security definer set search_path=''
as $$
begin
 if not meca_private.owner_push_authorized(p_token) then
   raise exception 'PUSH_UNAUTHORIZED';
 end if;
 return query
 select p.id,p.endpoint,p.p256dh,p.auth_secret
 from public.owner_push_subscriptions p
 where p.shop_id=p_shop_id
 order by p.created_at desc limit 20;
end;$$;
revoke all on function public.owner_push_targets(text,uuid) from public,anon,authenticated;
grant execute on function public.owner_push_targets(text,uuid) to anon;

create or replace function public.finish_owner_push_job(
 p_token text,p_job_id uuid,p_status text,p_error text default null
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if not meca_private.owner_push_authorized(p_token) then
  raise exception 'PUSH_UNAUTHORIZED';
 end if;
 if p_status not in ('submitted','skipped','retry','failed','uncertain') then return false;end if;
 update public.owner_push_outbox
 set status=case when p_status='retry' and attempts>=3 then 'failed' else p_status end,
     due_at=case when p_status='retry' then now()+make_interval(mins=>5*attempts) else due_at end,
     last_error=left(p_error,90),updated_at=now()
 where id=p_job_id and status='processing';
 get diagnostics v_count=row_count;
 return v_count=1;
end;$$;
revoke all on function public.finish_owner_push_job(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_owner_push_job(text,uuid,text,text) to anon;

create or replace function public.prune_owner_push_subscription(
 p_token text,p_subscription_id uuid
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if not meca_private.owner_push_authorized(p_token) then
  raise exception 'PUSH_UNAUTHORIZED';
 end if;
 delete from public.owner_push_subscriptions where id=p_subscription_id;
 get diagnostics v_count=row_count;
 return v_count=1;
end;$$;
revoke all on function public.prune_owner_push_subscription(text,uuid) from public,anon,authenticated;
grant execute on function public.prune_owner_push_subscription(text,uuid) to anon;
