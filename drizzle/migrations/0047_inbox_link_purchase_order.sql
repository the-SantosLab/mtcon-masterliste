CREATE OR REPLACE FUNCTION public.link_inbox_document_to_po(_doc_id uuid, _po_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.inbox_documents; t public.document_types; po public.purchase_orders;
  x jsonb; inv_id uuid; inv_no text; conf_date date; del_date date;
BEGIN
  IF NOT public.is_internal_user() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  SELECT * INTO d FROM public.inbox_documents WHERE id = _doc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dokument nicht gefunden'; END IF;
  IF d.linked_table IS NOT NULL OR d.status IN ('linked','dismissed') THEN
    RAISE EXCEPTION 'Dokument ist bereits zugeordnet oder verworfen';
  END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellung nicht gefunden'; END IF;
  IF po.status::text = 'cancelled' THEN RAISE EXCEPTION 'Bestellung ist storniert'; END IF;
  SELECT * INTO t FROM public.document_types WHERE id = d.classified_type_id;
  x := coalesce(d.extracted_data, '{}'::jsonb);

  IF t.code = 'invoice' THEN
    inv_no := nullif(trim(x->>'invoice_number'), '');
    IF inv_no IS NULL THEN RAISE EXCEPTION 'Rechnungsnummer fehlt'; END IF;
    IF EXISTS (SELECT 1 FROM public.supplier_invoices
               WHERE supplier_id IS NOT DISTINCT FROM po.supplier_id AND lower(supplier_invoice_no) = lower(inv_no)) THEN
      RAISE EXCEPTION 'Rechnung % dieses Lieferanten ist bereits erfasst', inv_no;
    END IF;
    INSERT INTO public.supplier_invoices (supplier_invoice_no, supplier_id, po_id, invoice_date, due_date, currency,
      subtotal_amount, tax_amount, total_amount, notes, created_by)
    VALUES (inv_no, po.supplier_id, po.id,
      nullif(x->>'invoice_date','')::date, nullif(x->>'due_date','')::date, coalesce(nullif(x->>'currency',''),'EUR'),
      nullif(x->>'net_amount','')::numeric, nullif(x->>'tax_amount','')::numeric, nullif(x->>'total_amount','')::numeric,
      'Aus Posteingang ' || coalesce(d.inbox_no,''), auth.uid())
    RETURNING id INTO inv_id;
    INSERT INTO public.supplier_invoice_items (invoice_id, po_item_id, position, art_nr, description, quantity, unit_price, tax_rate, line_total)
    SELECT inv_id, i.id, coalesce(i.position, row_number() over (order by i.position)), i.art_nr, i.description, i.qty_ordered,
           i.unit_price, 19, CASE WHEN i.unit_price IS NULL THEN NULL ELSE i.qty_ordered * i.unit_price END
    FROM public.purchase_order_items i WHERE i.po_id = po.id;
    PERFORM public.match_supplier_invoice(inv_id);
    UPDATE public.inbox_documents SET status='linked', linked_table='supplier_invoices', linked_id=inv_id,
      confirmed_by=auth.uid(), confirmed_at=now() WHERE id=d.id;
    RETURN jsonb_build_object('kind','invoice','id',inv_id);
  ELSIF t.code = 'order_confirmation' THEN
    conf_date := coalesce(nullif(x->>'confirmation_date','')::date, current_date);
    del_date := nullif(x->>'confirmed_delivery_date','')::date;
    IF del_date IS NULL THEN RAISE EXCEPTION 'Bestätigter Liefertermin fehlt'; END IF;
    UPDATE public.purchase_orders SET confirmation_received_at = conf_date, confirmed_delivery_date = del_date,
      needs_clarification = false, clarification_reason = NULL
    WHERE id = po.id;
    UPDATE public.inbox_documents SET status='linked', linked_table='purchase_orders', linked_id=po.id,
      confirmed_by=auth.uid(), confirmed_at=now() WHERE id=d.id;
    RETURN jsonb_build_object('kind','confirmation','id',po.id);
  ELSE
    RAISE EXCEPTION 'Nur Rechnungen und Auftragsbestätigungen lassen sich einer Bestellung zuordnen';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.link_inbox_document_to_po(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_inbox_document_to_po(uuid, uuid) TO authenticated, service_role;