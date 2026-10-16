-- Isolated test: inbox invoice / order confirmation linked to a purchase order. Rolled back by the final RAISE.
DO $$
DECLARE adm uuid; vw uuid; sup uuid; po uuid; d1 uuid; d2 uuid; d3 uuid; r jsonb; x record; n int;
BEGIN
  SELECT r.user_id INTO adm FROM public.user_roles r JOIN public.users_profile p ON p.id=r.user_id WHERE r.role='admin' LIMIT 1;
  SELECT p.id INTO vw FROM public.users_profile p WHERE p.id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','staff')) LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  INSERT INTO public.suppliers(code, name) VALUES ('ZZTEST','ZZ Testlieferant GmbH') RETURNING id INTO sup;
  INSERT INTO public.purchase_orders(supplier_id) VALUES (sup) RETURNING id INTO po;
  INSERT INTO public.purchase_order_items(po_id, position, art_nr, description, qty_ordered, qty_received, unit_price)
    VALUES (po,1,(SELECT art_nr FROM public.articles LIMIT 1),'Teil A',10,0,5);
  INSERT INTO public.inbox_documents(status, classified_type_id, extracted_data)
    SELECT 'auto_classified', id, '{"invoice_number":"ZZ-R-1","net_amount":50,"tax_amount":9.5,"total_amount":59.5}' FROM public.document_types WHERE code='invoice' RETURNING id INTO d1;
  INSERT INTO public.inbox_documents(status, classified_type_id, extracted_data)
    SELECT 'auto_classified', id, '{"invoice_number":"zz-r-1"}' FROM public.document_types WHERE code='invoice' RETURNING id INTO d2;
  INSERT INTO public.inbox_documents(status, classified_type_id, extracted_data)
    SELECT 'auto_classified', id, '{"confirmation_date":"2026-10-10","confirmed_delivery_date":"2026-11-20"}' FROM public.document_types WHERE code='order_confirmation' RETURNING id INTO d3;

  r := public.link_inbox_document_to_po(d1, po);
  SELECT * INTO x FROM public.supplier_invoices WHERE id=(r->>'id')::uuid;
  ASSERT x.po_id = po AND x.supplier_id = sup AND x.status = 'open' AND x.total_amount = 59.5, 'invoice fields';
  SELECT count(*) INTO n FROM public.supplier_invoice_items WHERE invoice_id=x.id; ASSERT n = 1, 'items copied';
  ASSERT x.match_status IS NOT NULL, 'match ran';
  ASSERT (SELECT linked_table FROM public.inbox_documents WHERE id=d1) = 'supplier_invoices';
  BEGIN PERFORM public.link_inbox_document_to_po(d1, po); RAISE EXCEPTION 'relink allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='relink allowed' THEN RAISE; END IF; END;
  BEGIN PERFORM public.link_inbox_document_to_po(d2, po); RAISE EXCEPTION 'duplicate allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='duplicate allowed' THEN RAISE; END IF; END;

  r := public.link_inbox_document_to_po(d3, po);
  SELECT * INTO x FROM public.purchase_orders WHERE id=po;
  ASSERT x.confirmation_received_at = '2026-10-10' AND x.confirmed_delivery_date = '2026-11-20', 'confirmation stored';

  PERFORM set_config('request.jwt.claim.sub', vw::text, true);
  BEGIN PERFORM public.link_inbox_document_to_po(d2, po); RAISE EXCEPTION 'viewer allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='viewer allowed' THEN RAISE; END IF; END;
  RAISE EXCEPTION 'OK (rolled back)';
END $$;
