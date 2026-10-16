CREATE OR REPLACE FUNCTION public.scan_goods_receipt(_po_item_id uuid, _warehouse_id uuid, _qty numeric, _lot_no text DEFAULT NULL, _delivery_note_no text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE poi public.purchase_order_items; po public.purchase_orders; gr uuid;
BEGIN
  IF NOT public.is_internal_user() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Menge muss größer 0 sein'; END IF;
  SELECT * INTO poi FROM public.purchase_order_items WHERE id = _po_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellposition nicht gefunden'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id = poi.po_id;
  IF po.status::text IN ('cancelled','received','draft') THEN RAISE EXCEPTION 'Bestellung ist nicht offen'; END IF;
  INSERT INTO public.goods_receipts(po_id, warehouse_id, delivery_note_no, notes, received_by)
  VALUES (po.id, _warehouse_id, nullif(trim(_delivery_note_no),''), 'Per Scan erfasst', auth.uid()) RETURNING id INTO gr;
  -- Bestandsbuchung und Mengenprüfung übernimmt der bestehende Wareneingangs-Trigger
  INSERT INTO public.goods_receipt_items(gr_id, po_item_id, qty_received, lot_no)
  VALUES (gr, poi.id, _qty, nullif(trim(_lot_no),''));
  RETURN gr;
END $$;
REVOKE ALL ON FUNCTION public.scan_goods_receipt(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_goods_receipt(uuid, uuid, numeric, text, text) TO authenticated, service_role;