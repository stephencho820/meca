-- Approval-first workshop verification. Disposable synthetic data is rolled back.
-- No owner/customer accounts, bookings or notification jobs persist after this file.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 v_owner uuid:=gen_random_uuid();
 v_slug text:='approval-test-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 v_shop uuid;v_oil uuid;v_brake uuid;v_day date;v_minutes int;
 v_payload jsonb;v_booking uuid;v_token text;v_row record;
BEGIN
 INSERT INTO auth.users(id) VALUES(v_owner);
 INSERT INTO public.shops(owner_id,name,slug,slot_capacity)
 VALUES(v_owner,'Isolated approval test garage',v_slug,2) RETURNING id INTO v_shop;
 SELECT s.id INTO v_oil FROM public.services s WHERE s.shop_id=v_shop AND s.name='엔진오일 교환';
 SELECT s.id INTO v_brake FROM public.services s WHERE s.shop_id=v_shop AND s.name='브레이크 점검';
 IF v_oil IS NULL OR v_brake IS NULL THEN RAISE EXCEPTION 'MISSING_SEEDED_SERVICES';END IF;
 SELECT min(t::date) INTO v_day
 FROM generate_series((now() at time zone 'Asia/Seoul')::date+3,(now() at time zone 'Asia/Seoul')::date+13,'1 day'::interval)t
 WHERE extract(dow from t) between 1 and 5;
 SELECT sum(s.duration_minutes)::int INTO v_minutes FROM public.services s WHERE s.id IN(v_oil,v_brake);
 IF NOT EXISTS(SELECT 1 FROM public.get_available_slots_multi(v_slug,ARRAY[v_oil,v_brake],v_day)
 WHERE time_label='10:00' AND available) THEN RAISE EXCEPTION 'MULTI_SLOT_UNAVAILABLE';END IF;
 v_payload:=public.create_public_booking_multi(v_slug,ARRAY[v_oil,v_brake],v_day,'10:00',
   'Synthetic Customer','01000001111','Synthetic Vehicle','Synthetic brake noise');
 v_booking:=(v_payload->>'booking_id')::uuid;
 v_token:=v_payload->>'manage_token';
 IF length(v_token)<>64 THEN RAISE EXCEPTION 'TOKEN_MISSING';END IF;
 SELECT b.status,b.selected_service_ids,b.service_name,round(extract(epoch from(b.ends_at-b.starts_at))/60)::int AS minutes,
 b.notes INTO v_row FROM public.bookings b WHERE b.id=v_booking;
 IF v_row.status<>'pending' OR v_row.selected_service_ids<>ARRAY[v_oil,v_brake]
 OR v_row.minutes<>v_minutes OR v_row.notes<>'Synthetic brake noise'
 THEN RAISE EXCEPTION 'PENDING_OR_MULTI_INCORRECT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.owner_email_outbox o WHERE o.booking_id=v_booking AND o.event_type='requested' AND o.status='pending')
 THEN RAISE EXCEPTION 'OWNER_EMAIL_NOT_QUEUED';END IF;
 v_payload:=public.lookup_customer_booking(v_token);
 IF v_payload->>'status'<>'pending' OR v_payload->>'service_name'<>v_row.service_name
 OR v_payload::text LIKE '%01000001111%'
 THEN RAISE EXCEPTION 'LOOKUP_OR_PRIVACY_BROKEN';END IF;
 UPDATE public.bookings SET status='confirmed' WHERE id=v_booking;
 v_payload:=public.lookup_customer_booking(v_token);
 IF v_payload->>'status'<>'confirmed' THEN RAISE EXCEPTION 'APPROVAL_NOT_VISIBLE_TO_CUSTOMER';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notification_outbox n WHERE n.booking_id=v_booking AND n.event_type='confirmed')
 THEN RAISE EXCEPTION 'CONFIRMATION_EVENT_MISSING';END IF;
 v_payload:=public.manage_customer_booking(v_token,'reschedule',v_day,'14:00');
 IF v_payload->>'status'<>'confirmed' THEN RAISE EXCEPTION 'RESCHEDULE_STATUS_BROKEN';END IF;
 IF (SELECT count(*) FROM public.owner_email_outbox o WHERE o.booking_id=v_booking AND o.event_type='rescheduled')<>1
 THEN RAISE EXCEPTION 'RESCHEDULE_EMAIL_EVENT_MISSING';END IF;
 v_payload:=public.manage_customer_booking(v_token,'cancel',null,null);
 IF v_payload->>'status'<>'cancelled' THEN RAISE EXCEPTION 'CANCEL_STATUS_BROKEN';END IF;
 IF (SELECT count(*) FROM public.owner_email_outbox o WHERE o.booking_id=v_booking AND o.event_type='cancelled')<>1
 THEN RAISE EXCEPTION 'CANCEL_EMAIL_EVENT_MISSING';END IF;
 RAISE NOTICE 'PASS: multi-services, symptoms, pending, email queue, owner confirmation, customer lookup, reschedule and cancel';
END;
$test$;
ROLLBACK;
