-- Privileged test runner only. All mutations are rolled back, including notifications.
BEGIN;
DO $$
DECLARE o uuid:=gen_random_uuid(); h uuid; actor uuid; blocked boolean; n integer;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='staff' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Staff test actor required'; END IF;
 INSERT INTO public.orders(id,order_no,customer_name) VALUES(o,'ISOLATED-HANDOFF-TEST','Isolierter Testkunde');
 UPDATE public.orders SET status='active' WHERE id=o;
 SELECT id INTO h FROM public.order_handoffs WHERE order_id=o AND stage='einkauf';
 IF h IS NULL THEN RAISE EXCEPTION 'Purchasing handoff missing'; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE href='/orders/'||o||'/akte';
 UPDATE public.orders SET status='active' WHERE id=o;
 IF n<>(SELECT count(*) FROM public.notifications WHERE href='/orders/'||o||'/akte') THEN RAISE EXCEPTION 'Duplicate notification'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications x JOIN public.users_profile p ON p.id=x.user_id WHERE x.href='/orders/'||o||'/akte' AND (NOT p.active OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('admin','staff')))) THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SET LOCAL ROLE authenticated;
 blocked:=false;
 BEGIN UPDATE public.order_handoffs SET department_id=NULL WHERE id=h; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Routing can be forged'; END IF;
 UPDATE public.order_handoffs SET status='done',completed_by=gen_random_uuid() WHERE id=h;
 IF NOT EXISTS(SELECT 1 FROM public.order_handoffs WHERE id=h AND completed_by=actor AND status='done') THEN RAISE EXCEPTION 'Actor not stamped'; END IF;
 blocked:=false;
 BEGIN UPDATE public.order_handoffs SET status='open' WHERE id=h; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'History can be reopened'; END IF;
 RESET ROLE;
END $$;
ROLLBACK;
