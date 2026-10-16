CREATE OR REPLACE FUNCTION public.scan_goods_receipt(_po_item_id uuid, _warehouse_id uuid, _qty numeric,
  _lot_no text DEFAULT NULL, _delivery_note_no text DEFAULT NULL, _over_decision text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE poi public.purchase_order_items; po public.purchase_orders; wh public.warehouses;
  gr uuid; gri uuid; loc uuid; v_open numeric; v_book numeric; v_over numeric := 0; v_case uuid; v_insp uuid; v_name text;
BEGIN
  PERFORM public._gi_require_staff();
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Menge muss größer 0 sein'; END IF;
  SELECT * INTO poi FROM public.purchase_order_items WHERE id = _po_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellposition nicht gefunden'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id = poi.po_id;
  IF po.status::text IN ('cancelled','received','draft') THEN RAISE EXCEPTION 'Bestellung ist nicht offen'; END IF;
  SELECT * INTO wh FROM public.warehouses WHERE id = _warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lager nicht gefunden'; END IF;

  v_open := poi.qty_ordered - poi.qty_received;
  v_book := _qty;
  IF _qty > v_open THEN
    IF _over_decision IS NULL THEN RAISE EXCEPTION 'OVERDELIVERY:% offen, % erfasst', v_open, _qty; END IF;
    IF _over_decision NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'Ungültige Entscheidung'; END IF;
    v_over := _qty - v_open;
    IF _over_decision = 'rejected' THEN v_book := v_open; ELSE PERFORM set_config('app.accept_overdelivery','on',true); END IF;
    IF v_book <= 0 THEN RAISE EXCEPTION 'Keine offene Menge – Lieferung komplett abgewiesen'; END IF;
  END IF;

  SELECT id INTO loc FROM public.storage_locations WHERE lager = wh.code AND lagerpl = 'I-PUNKT' LIMIT 1;
  IF loc IS NULL THEN
    INSERT INTO public.storage_locations(lager, lagerpl, behaelter, type, note, created_by)
    VALUES (wh.code, 'I-PUNKT', '0', 'sonstiges', 'Wareneingang vor Prüfung', auth.uid())
    RETURNING id INTO loc;
  END IF;

  INSERT INTO public.goods_receipts(po_id, warehouse_id, delivery_note_no, notes, received_by)
  VALUES (po.id, _warehouse_id, nullif(trim(_delivery_note_no),''), 'Per Scan erfasst · i-Punkt', auth.uid()) RETURNING id INTO gr;
  INSERT INTO public.goods_receipt_items(gr_id, po_item_id, qty_received, lot_no, storage_location_id)
  VALUES (gr, poi.id, v_book, nullif(trim(_lot_no),''), loc) RETURNING id INTO gri;
  PERFORM set_config('app.accept_overdelivery','off',true);

  SELECT bezeich_1 INTO v_name FROM public.articles WHERE art_nr = poi.art_nr;
  INSERT INTO public.cases(project_name, department_id, visibility, created_by, note, project_article_no, quantity, received_at)
  VALUES ('Wareneingangsprüfung ' || poi.art_nr || coalesce(' · ' || po.po_no, ''),
    'b0000002-0000-0000-0000-000000000002', 'department', auth.uid(),
    'Ware liegt am i-Punkt (' || wh.code || '). Menge ' || v_book || coalesce(', Charge ' || nullif(trim(_lot_no),''), '')
      || coalesce(', Artikel ' || v_name, '')
      || CASE WHEN v_over > 0 THEN E'\nÜberlieferung ' || v_over || ' ' || CASE WHEN _over_decision='accepted' THEN 'akzeptiert' ELSE 'abgewiesen' END ELSE '' END
      || E'\nPrüfen und freigeben unter /wareneingang-pruefung',
    poi.art_nr, ceil(v_book)::int, current_date)
  RETURNING id INTO v_case;

  INSERT INTO public.goods_inspections(gr_id, gr_item_id, po_item_id, art_nr, warehouse_id, ipunkt_location_id, qty, lot_no, over_qty, over_decision, case_id)
  VALUES (gr, gri, poi.id, poi.art_nr, _warehouse_id, loc, v_book, nullif(trim(_lot_no),''), v_over,
    CASE WHEN v_over > 0 THEN _over_decision END, v_case) RETURNING id INTO v_insp;
  RETURN gr;
END $function$;