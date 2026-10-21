-- Owner email: deduped transactional job events, owner isolation, opt-out,
-- worker-only claim and finalization. External Resend is never called in CI.
do $$
declare
 u uuid:='456789ab-1234-4234-8234-123456789abc';
 shop uuid;svc uuid;d date;bid uuid;token text;result jsonb;
 job uuid;n integer;
begin
 insert into auth.users(id) values(u);
 insert into public.shops(owner_id,name,slug,slot_capacity)
  values(u,'Owner Email Test Garage','owner-email-test',2) returning id into shop;
 if not exists(select 1 from public.owner_email_preferences p where p.shop_id=shop and p.enabled)
 then raise exception 'PREFERENCE_NOT_INITIALIZED';end if;
 select id into svc from public.services where shop_id=shop and name='엔진오일 교환';
 select min(t::date) into d from generate_series(current_date+2,current_date+8,'1 day'::interval) t
   where extract(dow from t) between 1 and 5;
 result:=public.create_public_booking_v2('owner-email-test',svc,d,'10:00','MailTest',
    '01057770001','Demo Auto');
 bid:=(result->>'booking_id')::uuid;token:=result->>'manage_token';
 if (select count(*) from public.owner_email_outbox where booking_id=bid and event_type='requested')<>1
 then raise exception 'REQUESTED_EMAIL_NOT_QUEUED';end if;
 update public.bookings set internal_note='private note' where id=bid;
 if (select count(*) from public.owner_email_outbox where booking_id=bid)<>1
 then raise exception 'IRRELEVANT_UPDATE_EMAIL_QUEUED';end if;
 result:=public.manage_customer_booking(token,'reschedule',d,'11:00');
 if (select count(*) from public.owner_email_outbox where booking_id=bid and event_type='rescheduled')<>1
 then raise exception 'RESCHEDULE_EMAIL_NOT_QUEUED';end if;
 result:=public.manage_customer_booking(token,'cancel',null,null);
 if (select count(*) from public.owner_email_outbox where booking_id=bid and event_type='cancelled')<>1
 then raise exception 'CANCEL_EMAIL_NOT_QUEUED';end if;
 -- A customer or shop owner must not forge or rewrite an email job.
 if has_table_privilege('anon','public.owner_email_outbox','SELECT') or
    has_table_privilege('authenticated','public.owner_email_outbox','INSERT') or
    has_table_privilege('authenticated','public.owner_email_outbox','UPDATE') or
    has_function_privilege('anon','public.claim_owner_email_jobs(uuid,integer)','EXECUTE') or
    has_function_privilege('authenticated','public.claim_owner_email_jobs(uuid,integer)','EXECUTE')
 then raise exception 'EMAIL_OUTBOX_PRIVILEGE_BROKEN';end if;
 if not (select relrowsecurity from pg_class where oid='public.owner_email_outbox'::regclass)
 then raise exception 'EMAIL_OUTBOX_RLS_DISABLED';end if;
 select id into job from public.claim_owner_email_jobs(bid,1);
 if job is null then raise exception 'WORKER_CLAIM_FAILED';end if;
 if not public.finish_owner_email_job(job,'submitted','fake-id',null)
 then raise exception 'WORKER_FINISH_FAILED';end if;
 if (select status from public.owner_email_outbox where id=job)<>'submitted'
 then raise exception 'EMAIL_STATUS_NOT_FINAL';end if;
 update public.owner_email_preferences set enabled=false where shop_id=shop;
 begin
  -- cancelled booking cannot be edited, so make another valid booking to test opt-out
  result:=public.create_public_booking_v2('owner-email-test',svc,d,'14:00','MailTest2','01057770002');
  if exists(select 1 from public.owner_email_outbox where booking_id=(result->>'booking_id')::uuid)
  then raise exception 'OPT_OUT_NOT_RESPECTED';end if;
 end;
 raise notice 'Owner email: online events, opt-out, worker-only queue and no irrelevant events PASS';
end $$;
