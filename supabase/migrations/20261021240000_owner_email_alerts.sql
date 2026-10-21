-- Owner-facing email notifications. Separate from customer Kakao (kept disabled).
-- Email destination is the authenticated owner's VERIFIED signup email, not user-provided booking data.
create table public.owner_email_preferences (
 shop_id uuid primary key references public.shops(id) on delete cascade,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.owner_email_preferences enable row level security;
create policy "owner email prefs read" on public.owner_email_preferences
 for select to authenticated using(exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
create policy "owner email prefs update" on public.owner_email_preferences
 for update to authenticated using(exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 )) with check(exists(
  select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())
 ));
grant select,update on public.owner_email_preferences to authenticated;
revoke all on public.owner_email_preferences from anon;
revoke insert,delete on public.owner_email_preferences from authenticated;

insert into public.owner_email_preferences(shop_id)
select id from public.shops on conflict do nothing;
create or replace function meca_private.init_owner_email_preferences()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.owner_email_preferences(shop_id) values(new.id) on conflict do nothing;
 return new;
end;$$;
revoke all on function meca_private.init_owner_email_preferences() from public,anon,authenticated;
create trigger meca_shops_owner_email_init
 after insert on public.shops for each row
 execute function meca_private.init_owner_email_preferences();

create table public.owner_email_outbox (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 event_type text not null check(event_type in ('requested','rescheduled','cancelled')),
 starts_at timestamptz not null,
 created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts between 0 and 3),
 status text not null default 'pending'
   check(status in ('pending','processing','submitted','skipped','retry','failed','uncertain')),
 provider_message_id text,
 error_code text,
 updated_at timestamptz not null default now()
);
create index owner_email_due_idx on public.owner_email_outbox(next_attempt_at,created_at)
 where status in ('pending','retry');
create index owner_email_shop_idx on public.owner_email_outbox(shop_id,created_at desc);
alter table public.owner_email_outbox enable row level security;
create policy "owner email outbox read" on public.owner_email_outbox for select to authenticated
 using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=(select auth.uid())));
grant select on public.owner_email_outbox to authenticated;
revoke all on public.owner_email_outbox from anon;
revoke insert,update,delete on public.owner_email_outbox from authenticated;

create or replace function meca_private.enqueue_owner_email()
returns trigger language plpgsql security definer set search_path=''
as $$
declare event text;
begin
 -- Only actual ONLINE customer-created reservations, not owner-manual bookings.
 if new.source is distinct from 'web' then return null;end if;
 if tg_op='INSERT' then
  if new.status in ('pending','confirmed') then event:='requested';end if;
 elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
  event:='cancelled';
 elsif new.status in ('pending','confirmed') and new.starts_at is distinct from old.starts_at then
  event:='rescheduled';
 end if;
 if event is not null and exists(select 1 from public.owner_email_preferences p
     where p.shop_id=new.shop_id and p.enabled)
 then
  insert into public.owner_email_outbox(shop_id,booking_id,event_type,starts_at)
   values(new.shop_id,new.id,event,new.starts_at);
 end if;
 return null;
end;$$;
revoke all on function meca_private.enqueue_owner_email() from public,anon,authenticated;
create trigger meca_bookings_owner_email
 after insert or update on public.bookings for each row
 execute function meca_private.enqueue_owner_email();

-- Privileged server worker only; arbitrary clients cannot claim or finish email jobs.
create or replace function public.claim_owner_email_jobs(p_booking_id uuid default null,p_limit int default 10)
returns setof public.owner_email_outbox
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with due as(
  select j.id from public.owner_email_outbox j
   where j.status in ('pending','retry') and j.next_attempt_at<=now()
     and j.attempts<3
     and (p_booking_id is null or j.booking_id=p_booking_id)
   order by j.next_attempt_at,j.created_at
   limit least(greatest(coalesce(p_limit,10),1),20)
   for update skip locked
 )
 update public.owner_email_outbox j
 set status='processing',attempts=j.attempts+1,updated_at=now()
 from due where j.id=due.id
 returning j.*;
end;$$;
revoke all on function public.claim_owner_email_jobs(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_owner_email_jobs(uuid,integer) to service_role;

create or replace function public.finish_owner_email_job(
 p_id uuid,p_status text,p_provider_id text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=''
as $$
declare n integer;
begin
 if p_status not in ('submitted','skipped','retry','failed','uncertain') then return false;end if;
 update public.owner_email_outbox
 set status=case when p_status='retry' and attempts>=3 then 'failed' else p_status end,
     next_attempt_at=case when p_status='retry' then now()+(case attempts when 1 then interval '5 minutes' else interval '15 minutes' end) else next_attempt_at end,
     provider_message_id=left(p_provider_id,160),error_code=left(p_error,100),updated_at=now()
 where id=p_id and status='processing';
 get diagnostics n=row_count;
 return n=1;
end;$$;
revoke all on function public.finish_owner_email_job(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_owner_email_job(uuid,text,text,text) to service_role;
grant select on public.owner_email_outbox,public.owner_email_preferences to service_role;
