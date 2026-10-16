-- Isolated, fully rolled back: scan completion, duplicate protection, roles.
BEGIN;
DO $$
DECLARE staff uuid; viewer uuid; wo uuid:=gen_random_uuid(); wh uuid; r jsonb; ok boolean; st numeric; ra uuid:=gen_random_uuid();
BEGIN
 SELECT user_id INTO staff FROM public.user_roles WHERE role='staff' LIMIT 1;
 SELECT user_id INTO viewer FROM public.user_roles WHERE role='viewer' LIMIT 1;
 IF viewer IS NULL THEN -- temporary, rolled back
  SELECT user_id INTO viewer FROM public.user_roles WHERE role='staff' AND user_id<>staff LIMIT 1;
  DELETE FROM public.user_roles WHERE user_id=viewer; INSERT INTO public.user_roles(user_id,role) VALUES(viewer,'viewer');
 END IF;
 SELECT id INTO wh FROM public.warehouses LIMIT 1;
 IF staff IS NULL OR viewer IS NULL OR wh IS NULL THEN RAISE EXCEPTION 'fixtures missing'; END IF;
 INSERT INTO public.production_orders(id,wo_no,art_nr,warehouse_id,quantity,status) VALUES(wo,'ISOLATED-SCAN-DONE','ISOLATED-SCAN-ART',wh,10,'in_progress');

 PERFORM set_config('request.jwt.claim.sub',viewer::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',viewer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 ok:=false; BEGIN PERFORM public.scan_production_complete(wo,1,0,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN ok:=(SQLERRM='Keine Berechtigung'); END;
 IF NOT ok THEN RAISE EXCEPTION 'viewer could complete'; END IF;
 RESET ROLE;

 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 r:=public.scan_production_complete(wo,4,0,ra);
 IF (r->>'done')::numeric<>4 OR (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'first report wrong %',r; END IF;
 r:=public.scan_production_complete(wo,4,0,ra);
 IF NOT (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'replay not detected %',r; END IF;
 ok:=false; BEGIN PERFORM public.scan_production_complete(wo,4,0,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN ok:=SQLERRM LIKE 'Zwischenzeitlich%'; END;
 IF NOT ok THEN RAISE EXCEPTION 'stale second phone accepted'; END IF;
 ok:=false; BEGIN PERFORM public.scan_production_complete(wo,7,4,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN ok:=true; END;
 IF NOT ok THEN RAISE EXCEPTION 'over quantity accepted'; END IF;
 r:=public.scan_production_complete(wo,6,4,gen_random_uuid());
 RESET ROLE;
 IF (SELECT status FROM public.production_orders WHERE id=wo)<>'completed' THEN RAISE EXCEPTION 'not completed'; END IF;
 SELECT sum(quantity) INTO st FROM public.stock_movements WHERE reference_id=wo;
 IF st<>10 THEN RAISE EXCEPTION 'stock movements % <> 10',st; END IF;
 ok:=false; BEGIN SET LOCAL ROLE authenticated; PERFORM public.scan_production_complete(wo,1,10,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN ok:=true; END;
 RESET ROLE;
 IF NOT ok THEN RAISE EXCEPTION 'completed order accepted again'; END IF;
 RAISE NOTICE 'ALL PASSED';
END $$;
ROLLBACK;
