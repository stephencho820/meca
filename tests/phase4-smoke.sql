-- Transactional outbox smoke test in disposable CI database.
do $$
declare owner_id uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 v_shop_id uuid; service_id uuid; day date;bid uuid; item public.notification_outbox%rowtype;
begin
 insert into auth.users(id) values(owner_id);
 insert into public.shops(owner_id,name,slug) values(owner_id,'Notify test','meca-notify-test') returning id into v_shop_id;
 select id into service_id from public.services where shop_id=v_shop_id and name='엔진오일 교환' limit 1;
 select min(d::date) into day from generate_series(current_date+2,current_date+8,interval '1 day') d
  where extract(dow from d) between 1 and 5;
 bid:=public.create_public_booking('meca-notify-test',service_id,day,'10:00','Tester','01012345678');
 if (select count(*) from public.notification_outbox where booking_id=bid and event_type='confirmed')<>1
 then raise exception 'NO_CONFIRMATION_EVENT'; end if;
 update public.bookings set status='cancelled' where id=bid;
 if (select count(*) from public.notification_outbox where booking_id=bid and event_type='cancelled')<>1
 then raise exception 'NO_CANCELLATION_EVENT'; end if;
 select * into item from public.claim_meca_notifications(bid,10) limit 1;
 if item.id is null then raise exception 'OUTBOX_NOT_CLAIMED'; end if;
 if not public.finish_meca_notification(item.id,'skipped',null,'SUPERSEDED_EVENT')
 then raise exception 'OUTBOX_FINISH_FAILED'; end if;
 if (select status from public.notification_outbox where id=item.id)<>'skipped'
 then raise exception 'OUTBOX_STATUS_WRONG'; end if;
 raise notice 'Kakao outbox creation, cancellation, claiming and finalization PASS';
end $$;
