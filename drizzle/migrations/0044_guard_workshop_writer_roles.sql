ALTER POLICY "internal write production_orders" ON public.production_orders USING (public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))) WITH CHECK (public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
ALTER POLICY "internal write production_order_items" ON public.production_order_items USING (public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))) WITH CHECK (public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
DO $$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_production_order','production_order_issue','production_order_complete') LOOP
  definition:=pg_get_functiondef(f.oid);
  IF position('IF NOT public.is_internal_user() THEN' IN definition)=0 THEN RAISE EXCEPTION 'Expected workshop authorization guard missing for %',f.oid::regprocedure; END IF;
  definition:=replace(definition,'IF NOT public.is_internal_user() THEN','IF NOT public.is_internal_user() OR NOT (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''staff'')) THEN');
  EXECUTE definition;
 END LOOP;
END $$;