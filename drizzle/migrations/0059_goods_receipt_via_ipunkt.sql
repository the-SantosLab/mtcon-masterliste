ALTER TABLE public.goods_inspections ADD COLUMN IF NOT EXISTS planned_location_id uuid;

CREATE OR REPLACE FUNCTION public._gi_book_receipt(_po_id uuid, _warehouse_id uuid, _delivery_note_no text, _notes text, _items jsonb, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE po public.purchase_orders; wh public.warehouses; poi public.purchase_order_items;
  it jsonb; gr uuid; gri uuid; loc uuid; v_open numeric; v_qty numeric; v_book numeric; v_over numeric; v_dec text;
  v_case uuid; v_lines text := ''; v_n int := 0;
BEGIN
  PERFORM public._gi_require_staff();
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellung nicht gefunden'; END IF;
  IF po.status::text IN ('cancelled','received','draft') THEN RAISE EXCEPTION 'Bestellung ist nicht offen'; END IF;
  SELECT * INTO wh FROM public.warehouses WHERE id = _warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lager nicht gefunden'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Keine Positionen'; END IF;

  SELECT id INTO loc FROM public.storage_locations WHERE lager = wh.code AND lagerpl = 'I-PUNKT' LIMIT 1;
  IF loc IS NULL THEN
    INSERT INTO public.storage_locations(lager, lagerpl, behaelter, type, note, created_by)
    VALUES (wh.code, 'I-PUNKT', '0', 'sonstiges', 'Wareneingang vor Prüfung', auth.uid()) RETURNING id INTO loc;
  END IF;

  INSERT INTO public.goods_receipts(po_id, warehouse_id, delivery_note_no, notes, received_by)
  VALUES (po.id, _warehouse_id, nullif(trim(_delivery_note_no),''), concat_ws(' · ', nullif(trim(_notes),''), _source || ' · i-Punkt'), auth.uid())
  RETURNING id INTO gr;

  INSERT INTO public.cases(project_name, department_id, visibility, created_by, note, received_at)
  VALUES ('Wareneingangsprüfung ' || coalesce(po.po_no, ''), 'b0000001-0000-0000-0000-000000000002', 'department', auth.uid(),
    'Ware liegt am i-Punkt (' || wh.code || ').', current_date)
  RETURNING id INTO v_case;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO poi FROM public.purchase_order_items WHERE id = (it->>'po_item_id')::uuid AND po_id = po.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bestellposition gehört nicht zur Bestellung'; END IF;
    v_qty := (it->>'qty')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Menge muss größer 0 sein'; END IF;
    v_open := poi.qty_ordered - poi.qty_received; v_book := v_qty; v_over := 0; v_dec := nullif(it->>'over_decision','');
    IF v_qty > v_open THEN
      IF v_dec IS NULL THEN RAISE EXCEPTION 'OVERDELIVERY:Position % – % offen, % erfasst', poi.position, v_open, v_qty; END IF;
      IF v_dec NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'Ungültige Entscheidung'; END IF;
      v_over := v_qty - v_open;
      IF v_dec = 'rejected' THEN v_book := v_open; END IF;
    ELSE v_dec := NULL; END IF;
    IF v_book <= 0 THEN CONTINUE; END IF;
    PERFORM set_config('app.accept_overdelivery', CASE WHEN v_dec = 'accepted' THEN 'on' ELSE 'off' END, true);
    INSERT INTO public.goods_receipt_items(gr_id, po_item_id, qty_received, lot_no, lot_no_ext, expiry_date, storage_location_id)
    VALUES (gr, poi.id, v_book, nullif(trim(it->>'lot_no'),''), nullif(trim(it->>'lot_no_ext'),''), nullif(it->>'expiry_date','')::date, loc)
    RETURNING id INTO gri;
    PERFORM set_config('app.accept_overdelivery','off',true);
    INSERT INTO public.goods_inspections(gr_id, gr_item_id, po_item_id, art_nr, warehouse_id, ipunkt_location_id, qty, lot_no, over_qty, over_decision, case_id, planned_location_id)
    VALUES (gr, gri, poi.id, poi.art_nr, _warehouse_id, loc, v_book, nullif(trim(it->>'lot_no'),''), v_over, v_dec, v_case, nullif(it->>'planned_location_id','')::uuid);
    v_n := v_n + 1;
    v_lines := v_lines || E'\n' || poi.art_nr || ': ' || v_book || coalesce(', Charge ' || nullif(trim(it->>'lot_no'),''), '')
      || CASE WHEN v_over > 0 THEN ', Überlieferung ' || v_over || CASE WHEN v_dec='accepted' THEN ' akzeptiert' ELSE ' abgewiesen' END ELSE '' END;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Keine Menge zu buchen – Lieferung komplett abgewiesen'; END IF;

  UPDATE public.cases SET note = note || v_lines || E'\nPrüfen und freigeben unter /wareneingang-pruefung',
    project_name = project_name || CASE WHEN v_n = 1 THEN ' · ' || poi.art_nr ELSE ' · ' || v_n || ' Positionen' END,
    project_article_no = CASE WHEN v_n = 1 THEN poi.art_nr END
   WHERE id = v_case;
  RETURN gr;
END $function$;
REVOKE ALL ON FUNCTION public._gi_book_receipt(uuid,uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.book_goods_receipt(_po_id uuid, _warehouse_id uuid, _items jsonb, _delivery_note_no text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._gi_book_receipt(_po_id, _warehouse_id, _delivery_note_no, _notes, _items, 'Einkauf');
$$;
GRANT EXECUTE ON FUNCTION public.book_goods_receipt(uuid,uuid,jsonb,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.scan_goods_receipt(_po_item_id uuid, _warehouse_id uuid, _qty numeric,
  _lot_no text DEFAULT NULL, _delivery_note_no text DEFAULT NULL, _over_decision text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_po uuid;
BEGIN
  SELECT po_id INTO v_po FROM public.purchase_order_items WHERE id = _po_item_id;
  IF v_po IS NULL THEN RAISE EXCEPTION 'Bestellposition nicht gefunden'; END IF;
  RETURN public._gi_book_receipt(v_po, _warehouse_id, _delivery_note_no, NULL,
    jsonb_build_array(jsonb_build_object('po_item_id', _po_item_id, 'qty', _qty, 'lot_no', _lot_no, 'over_decision', _over_decision)), 'Per Scan erfasst');
END $function$;

-- Direkte Wareneingänge auf normale Plätze nur noch für Admins/Serverrollen; Mitarbeitende buchen über den i-Punkt
CREATE OR REPLACE FUNCTION public.guard_goods_receipt_item_ipunkt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF NEW.storage_location_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.storage_locations WHERE id = NEW.storage_location_id AND lagerpl = 'I-PUNKT') THEN
    RAISE EXCEPTION 'Wareneingang bitte über den i-Punkt mit anschließender Prüfung buchen';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_gri_ipunkt ON public.goods_receipt_items;
CREATE TRIGGER trg_guard_gri_ipunkt BEFORE INSERT ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.guard_goods_receipt_item_ipunkt();