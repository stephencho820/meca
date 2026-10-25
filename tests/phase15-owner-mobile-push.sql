-- Web Push lifecycle + worker isolation. Everything stays in this transaction.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
declare
 v_owner uuid:=gen_random_uuid();
 v_shop uuid;v_slug text:='push-test-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 v_service uuid;v_day date;v_payload jsonb;v_booking uuid;v_job uuid;
 v_key text:=repeat('f',64);v_status text;v_count integer;v_subscription uuid;
begin
 update meca_private.owner_push_worker_config
 set token_hash=encode(extensions.digest(v_key,'sha256'),'hex')
 where id=1;
 if has_function_privilege('anon','public.claim_owner_push_test(uuid)','EXECUTE')
   or not has_function_privilege('authenticated','public.claim_owner_push_test(uuid)','EXECUTE')
 then raise exception 'TEST_ENDPOINT_AUTH_BROKEN';end if;
 if public.owner_push_worker_ready(repeat('0',64)) or not public.owner_push_worker_ready(v_key)
 then raise exception 'WORKER_AUTH_BROKEN';end if;
 if has_table_privilege('anon','public.owner_push_subscriptions','SELECT')
    or has_table_privilege('anon','public.owner_push_outbox','SELECT')
    or has_table_privilege('authenticated','public.owner_push_outbox','INSERT')
    or has_function_privilege('authenticated','public.claim_owner_push_jobs(text,uuid,integer)','EXECUTE')
 then raise exception 'PUSH_ACCESS_CONTROL_BROKEN';end if;
 if not (select relrowsecurity from pg_class where oid='public.owner_push_subscriptions'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.owner_push_outbox'::regclass)
 then raise exception 'PUSH_RLS_DISABLED';end if;
 begin
   perform public.claim_owner_push_jobs(repeat('0',64),null,1);
   raise exception 'BAD_WORKER_CLAIM_ACCEPTED';
 exception when others then
   if sqlerrm<>'PUSH_UNAUTHORIZED' then raise;end if;
 end;
 insert into auth.users(id) values(v_owner);
 insert into public.shops(owner_id,name,slug,slot_capacity)
 values(v_owner,'Push isolated fixture',v_slug,2) returning id into v_shop;
 select s.id into v_service from public.services s
 where s.shop_id=v_shop and s.name='엔진오일 교환';
 select min(t::date) into v_day from generate_series(current_date+3,current_date+13,'1 day'::interval)t
 where extract(dow from t) between 1 and 5;
 if v_service is null or v_day is null then raise exception 'FIXTURE_MISSING';end if;
 if public.claim_owner_push_test(v_shop) then raise exception 'UNAUTHENTICATED_TEST_ALLOWED';end if;
 v_payload:=public.create_public_booking_v2(v_slug,v_service,v_day,'10:00',
 'Push Customer','01098980000','Fake Car','Fake Note');
 v_booking:=(v_payload->>'booking_id')::uuid;
 if (select count(*) from public.owner_push_outbox o
   where o.booking_id=v_booking and o.event_type='requested' and o.status='pending')<>1
 then raise exception 'REQUESTED_PUSH_NOT_QUEUED';end if;
 update public.bookings set internal_note='owner only' where id=v_booking;
 if (select count(*) from public.owner_push_outbox o where o.booking_id=v_booking)<>1
 then raise exception 'SPURIOUS_PUSH_ON_NOTE_CHANGE';end if;
 insert into public.owner_push_subscriptions(shop_id,owner_id,endpoint,endpoint_hash,p256dh,auth_secret)
 values(v_shop,v_owner,'https://fcm.googleapis.com/fcm/send/FAKE',
 encode(extensions.digest('https://fcm.googleapis.com/fcm/send/FAKE','sha256'),'hex'),
 repeat('a',87),repeat('b',22)) returning id into v_subscription;
 if (select count(*) from public.owner_push_targets(v_key,v_shop))<>1
 then raise exception 'SUBSCRIPTIONS_NOT_AVAILABLE_TO_WORKER';end if;
 select id into v_job from public.claim_owner_push_jobs(v_key,v_booking,1);
 if v_job is null then raise exception 'CLAIM_FAILED';end if;
 if not public.finish_owner_push_job(v_key,v_job,'submitted',null)
 then raise exception 'FINISH_FAILED';end if;
 if (select status from public.owner_push_outbox where id=v_job)<>'submitted'
 then raise exception 'FINISH_NOT_SAVED';end if;
 if not public.prune_owner_push_subscription(v_key,v_subscription)
 then raise exception 'PRUNE_FAILED';end if;
 if (select count(*) from public.owner_push_targets(v_key,v_shop))<>0
 then raise exception 'PRUNE_DID_NOT_REMOVE_DEVICE';end if;
 perform public.manage_customer_booking(v_payload->>'manage_token','reschedule',v_day,'14:00');
 perform public.manage_customer_booking(v_payload->>'manage_token','cancel',null,null);
 if (select count(*) from public.owner_push_outbox
    where booking_id=v_booking and event_type in ('rescheduled','cancelled'))<>2
 then raise exception 'CUSTOMER_CHANGES_PUSH_NOT_QUEUED';end if;
 raise notice 'PASS: owner push RLS, worker secret, booking event, no note event, per-device target/prune, reschedule/cancel';
end;
$test$;
ROLLBACK;
