-- Phase 4: transactional Kakao notification outbox. No provider credentials stored.
-- Safe default: events queued only, never delivered unless backend explicitly enabled.
create table if not exists public.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 shop_id uuid not null references public.shops(id) on delete cascade,
 event_type text not null check(event_type in ('requested','confirmed','rescheduled','cancelled','reminder')),
 event_key text not null unique,
 booking_starts_at timestamptz not null,
 scheduled_at timestamptz not null default now(),
 status text not null default 'pending'
   check(status in ('pending','processing','submitted','skipped','failed')),
 attempts integer not null default 0 check(attempts>=0),
 provider_group_id text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists notification_due_idx on public.notification_outbox(scheduled_at,created_at)
 where status='pending';
create index if not exists notification_shop_idx on public.notification_outbox(shop_id,created_at desc);
alter table public.notification_outbox enable row level security;
-- Owners can inspect statuses but not forge or alter outbox items.
create policy "notifications select owner" on public.notification_outbox for select to authenticated
using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select on public.notification_outbox to authenticated;
revoke all on public.notification_outbox from anon;
revoke insert,update,delete on public.notification_outbox from authenticated;

create or replace function meca_private.enqueue_booking_notification()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_type text;
begin
 if tg_op='INSERT' then
   if new.status='pending' then v_type:='requested';
   elsif new.status='confirmed' then v_type:='confirmed';
   end if;
 elsif new.status='cancelled' and old.status<>'cancelled' then
   v_type:='cancelled';
 elsif new.status='confirmed' and old.status='pending' then
   v_type:='confirmed';
 elsif new.status in ('pending','confirmed') and
   (new.starts_at is distinct from old.starts_at) then
   v_type:='rescheduled';
 end if;
 if v_type is not null then
   insert into public.notification_outbox(booking_id,shop_id,event_type,event_key,booking_starts_at)
   values(new.id,new.shop_id,v_type,new.id::text||':'||v_type||':'||gen_random_uuid()::text,new.starts_at);
 end if;
 return null;
end;
$$;
revoke all on function meca_private.enqueue_booking_notification() from public,anon,authenticated;
drop trigger if exists meca_notification_enqueue on public.bookings;
create trigger meca_notification_enqueue after insert or update on public.bookings
for each row execute function meca_private.enqueue_booking_notification();

-- Store no phone numbers in outbox. Only the worker reads booking details
-- under server-side credentials, and only while processing a due event.
create or replace function public.schedule_meca_reminders()
returns integer language plpgsql security definer set search_path=''
as $$
declare inserted integer;
begin
 insert into public.notification_outbox(booking_id,shop_id,event_type,event_key,booking_starts_at,scheduled_at)
 select b.id,b.shop_id,'reminder',b.id::text||':reminder:'||
        (b.starts_at at time zone 'Asia/Seoul')::date::text,b.starts_at,now()
 from public.bookings b
 where b.status='confirmed'
   and (b.starts_at at time zone 'Asia/Seoul')::date
       = (now() at time zone 'Asia/Seoul')::date + 1
 on conflict(event_key) do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end;
$$;
revoke all on function public.schedule_meca_reminders() from public,anon,authenticated;
grant execute on function public.schedule_meca_reminders() to service_role;

create or replace function public.claim_meca_notifications(
  p_booking_id uuid default null,p_limit integer default 20
) returns setof public.notification_outbox
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with selected as (
  select n.id from public.notification_outbox n
  where n.status='pending' and n.scheduled_at<=now()
    and (p_booking_id is null or n.booking_id=p_booking_id)
  order by n.scheduled_at,n.created_at
  limit least(greatest(coalesce(p_limit,20),1),30)
  for update skip locked
 )
 update public.notification_outbox n
 set status='processing',attempts=n.attempts+1,updated_at=now()
 from selected s where n.id=s.id
 returning n.*;
end;
$$;
revoke all on function public.claim_meca_notifications(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_meca_notifications(uuid,integer) to service_role;

create or replace function public.finish_meca_notification(
 p_id uuid,p_status text,p_group_id text default null,p_error text default null
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare affected integer;
begin
 if p_status not in ('submitted','skipped','failed') then return false; end if;
 update public.notification_outbox
 set status=p_status,provider_group_id=left(p_group_id,140),
     last_error=left(p_error,160),updated_at=now()
 where id=p_id and status='processing';
 get diagnostics affected=row_count;
 return affected=1;
end;
$$;
revoke all on function public.finish_meca_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_meca_notification(uuid,text,text,text) to service_role;

-- One crashed/ambiguous external call must NEVER auto-send again.
-- Operators can diagnose 'processing' records manually without duplicates.
grant select on public.notification_outbox,public.bookings,public.shops to service_role;
