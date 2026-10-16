-- Isolated rule test for partial/final invoices. Everything is rolled back by the final RAISE.
DO $$
DECLARE oid uuid := gen_random_uuid(); adm uuid; vw uuid; p1 uuid; p2 uuid; f uuid; x record;
BEGIN
  SELECT r.user_id INTO adm FROM public.user_roles r JOIN public.users_profile p ON p.id=r.user_id WHERE r.role='admin' LIMIT 1;
  SELECT p.id INTO vw FROM public.users_profile p WHERE p.id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','staff')) LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  INSERT INTO public.orders(id, status, customer_name) VALUES (oid,'active','ZZ Test');
  INSERT INTO public.order_items(order_id, position, description, quantity, unit_price, line_total, tax_rate) VALUES (oid,1,'A',10,100,1000,19),(oid,2,'B',1,500,500,19);
  p1 := public.create_partial_invoice(oid, 30);
  SELECT * INTO x FROM public.invoices WHERE id=p1; ASSERT x.subtotal_amount = 450 AND x.total_amount = 535.50;
  UPDATE public.invoices SET status='sent' WHERE id=p1;
  p2 := public.create_partial_invoice(oid, NULL, 600); UPDATE public.invoices SET status='sent' WHERE id=p2;
  BEGIN PERFORM public.create_partial_invoice(oid, NULL, 451); RAISE EXCEPTION 'over limit allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'over limit allowed' THEN RAISE; END IF; END;
  f := public.create_final_invoice(oid);
  SELECT * INTO x FROM public.invoices WHERE id=f; ASSERT x.subtotal_amount = 450 AND x.tax_amount = 85.50, 'final must deduct partials';
  PERFORM set_config('request.jwt.claim.sub', vw::text, true);
  BEGIN PERFORM public.create_partial_invoice(oid, 1); RAISE EXCEPTION 'viewer allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'viewer allowed' THEN RAISE; END IF; END;
  RAISE EXCEPTION 'OK (rolled back)';
END $$;
