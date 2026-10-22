-- Phase 13: multi-service customer booking, manual approval default and customer link.
DO $$
DECLARE
 v_shop uuid;svc1 uuid;svc2 uuid;day date;v jsonb;bid uuid;token text;dur int;
BEGIN
 INSERT INTO auth.users(id) VALUES('b347bf19-c2c9-41e4-9b3f-112255663388');
 INSERT INTO public.shops(owner_id,name,slug,slot_capacity)
 VALUES('b347bf19-c2c9-41e4-9b3f-112255663388','Multi service test','multi-services-test',1)
 RETURNING id INTO v_shop;
 SELECT id INTO svc1 FROM public.services WHERE shop_id=v_shop AND name='엔진오일 교환';
 SELECT id INTO svc2 FROM public.services WHERE shop_id=v_shop AND name='브레이크 점검';
 SELECT min(x::date) INTO day FROM generate_series(current_date+2,current_date+10,'1 day'::interval) x
 WHERE extract(dow from x) between 1 and 5;
 IF svc1 IS NULL OR svc2 IS NULL THEN RAISE EXCEPTION 'SERVICES_NOT_SEEDED';END IF;
 SELECT sum(duration_minutes)::int INTO dur FROM public.services WHERE id IN(svc1,svc2);
 IF NOT EXISTS(select 1 from public.get_available_slots_multi('multi-services-test',array[svc1,svc2],day)
   where time_label='10:00' and available) THEN RAISE EXCEPTION 'MULTI_SLOTS_NOT_AVAILABLE';END IF;
 v:=public.create_public_booking_multi('multi-services-test',array[svc1,svc2],day,'10:00',
   'Multi Customer','01077778888','Car','브레이크에서 소음이 나요');
 bid:=(v->>'booking_id')::uuid;token:=v->>'manage_token';
 IF length(token)<>64 THEN RAISE EXCEPTION 'MULTI_TOKEN_MISSING';END IF;
 IF NOT EXISTS(select 1 from public.bookings b where b.id=bid and b.status='pending'
    and b.service_id=svc1 and b.selected_service_ids=array[svc1,svc2]
    and extract(epoch from(b.ends_at-b.starts_at))/60=dur
    and b.service_name like '%브레이크%'
 ) THEN RAISE EXCEPTION 'MULTI_BOOKING_CONTENT_WRONG';END IF;
 IF NOT EXISTS(select 1 from public.lookup_customer_booking(token) b
   where b->>'status'='pending' and b->>'service_name' like '%브레이크%')
 THEN RAISE EXCEPTION 'MULTI_CUSTOMER_LINK_INVALID';END IF;
 IF (select count(*) from public.owner_email_outbox where booking_id=bid and event_type='requested')<>1
 THEN RAISE EXCEPTION 'PENDING_OWNER_EMAIL_EVENT_MISSING';END IF;
 BEGIN
  PERFORM public.create_public_booking_multi('multi-services-test',array[svc1,svc1],day,'14:00',
    'Attack','01077778889');
  RAISE EXCEPTION 'DUPLICATE_SERVICE_ACCEPTED';
 EXCEPTION WHEN others THEN IF sqlerrm<>'INVALID_BOOKING' THEN RAISE;END IF;
 END;
 BEGIN
  PERFORM public.create_public_booking_multi('multi-services-test',array[svc1,svc2],day,'10:30',
    'Overbook','01077778890');
  RAISE EXCEPTION 'OVERLAP_ACCEPTED';
 EXCEPTION WHEN others THEN IF sqlerrm<>'SLOT_UNAVAILABLE' THEN RAISE;END IF;
 END;
 PERFORM public.manage_customer_booking(token,'reschedule',day,'14:00');
 IF NOT EXISTS(select 1 from public.bookings b WHERE b.id=bid
    and (b.starts_at at time zone 'Asia/Seoul')::time='14:00'
    and extract(epoch from(b.ends_at-b.starts_at))/60=dur
    and b.status='pending')
 THEN RAISE EXCEPTION 'MULTI_RESCHEDULE_DURATION_OR_APPROVAL_BROKEN';END IF;
 v:=public.create_public_booking_v2('multi-services-test',svc1,day,'09:00',
    'Legacy Customer','01077778899');
 IF (select status from public.bookings where id=(v->>'booking_id')::uuid)<>'pending'
 THEN RAISE EXCEPTION 'LEGACY_WEB_RPC_SHOULD_BE_PENDING';END IF;
 RAISE NOTICE 'PASS: multi selection, summed duration, pending by default, private reschedule and outbox';
END $$;
