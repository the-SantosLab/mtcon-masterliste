-- Privileged runner, no durable test rows or stock movements.
BEGIN;
DO $$
DECLARE actor uuid; wo uuid:=gen_random_uuid(); wh uuid; denied boolean; n integer;
BEGIN
 SELECT user_id INTO actor FROM public.user_roles WHERE role='viewer' LIMIT 1;
 IF actor IS NULL THEN
  SELECT id INTO actor FROM public.users_profile LIMIT 1;
  DELETE FROM public.user_roles WHERE user_id=actor;
  INSERT INTO public.user_roles(user_id,role) VALUES(actor,'viewer');
 END IF;
 SELECT id INTO wh FROM public.warehouses LIMIT 1;
 IF actor IS NULL OR wh IS NULL THEN RAISE EXCEPTION 'Viewer and warehouse fixtures required'; END IF;
 INSERT INTO public.production_orders(id,wo_no,art_nr,warehouse_id) VALUES(wo,'ISOLATED-VIEWER-ROLE','ISOLATED-NO-STOCK',wh);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SET LOCAL ROLE authenticated;
 UPDATE public.production_orders SET note='forged' WHERE id=wo;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Viewer can update workshop orders'; END IF;
 denied:=false;
 BEGIN PERFORM public.production_order_complete(wo,1,NULL); EXCEPTION WHEN raise_exception THEN denied:=(SQLERRM='Keine Berechtigung'); END;
 IF NOT denied THEN RAISE EXCEPTION 'Viewer can complete workshop orders'; END IF;
 denied:=false;
 BEGIN PERFORM public.production_order_issue(wo,false); EXCEPTION WHEN raise_exception THEN denied:=(SQLERRM='Keine Berechtigung'); END;
 IF NOT denied THEN RAISE EXCEPTION 'Viewer can issue workshop material'; END IF;
 denied:=false;
 BEGIN PERFORM public.create_production_order('ISOLATED-NO-STOCK',1,wh); EXCEPTION WHEN raise_exception THEN denied:=(SQLERRM='Keine Berechtigung'); END;
 IF NOT denied THEN RAISE EXCEPTION 'Viewer can create workshop orders'; END IF;
 RESET ROLE;
END $$;
ROLLBACK;
