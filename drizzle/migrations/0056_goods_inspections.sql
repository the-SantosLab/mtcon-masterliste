CREATE TABLE public.goods_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  gr_item_id uuid REFERENCES public.goods_receipt_items(id) ON DELETE SET NULL,
  po_item_id uuid,
  art_nr text NOT NULL,
  warehouse_id uuid NOT NULL,
  ipunkt_location_id uuid NOT NULL,
  qty numeric(14,3) NOT NULL,
  lot_no text,
  over_qty numeric(14,3) NOT NULL DEFAULT 0,
  over_decision text CHECK (over_decision IN ('accepted','rejected')),
  case_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','released','defect','stored','defect_stored','returned')),
  stored_location_id uuid,
  note text,
  decided_by uuid, decided_at timestamptz,
  stored_by uuid, stored_at timestamptz,
  returned_by uuid, returned_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.goods_inspections TO authenticated;
GRANT ALL ON public.goods_inspections TO service_role;
ALTER TABLE public.goods_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read inspections" ON public.goods_inspections FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE INDEX goods_inspections_status_idx ON public.goods_inspections(status);

-- Überlieferung nur zulassen, wenn die Scan-RPC die Annahme ausdrücklich gesetzt hat
CREATE OR REPLACE FUNCTION public.process_goods_receipt_item()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_poi public.purchase_order_items%ROWTYPE;
  v_gr  public.goods_receipts%ROWTYPE;
  v_remaining numeric(14,3);
  v_mov_id uuid;
  v_total_received numeric(14,3);
  v_supplier_lief_nr text;
  v_supplier_name text;
  v_lot_id uuid;
  v_lot_existing public.lots%ROWTYPE;
  v_loc public.storage_locations%ROWTYPE;
BEGIN
  SELECT * INTO v_poi FROM public.purchase_order_items WHERE id = NEW.po_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO-Position nicht gefunden'; END IF;
  SELECT * INTO v_gr FROM public.goods_receipts WHERE id = NEW.gr_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wareneingang nicht gefunden'; END IF;

  v_remaining := v_poi.qty_ordered - v_poi.qty_received;
  IF NEW.qty_received > v_remaining AND coalesce(current_setting('app.accept_overdelivery', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Erfasste Menge (%) überschreitet offene Menge (%) für Position %',
      NEW.qty_received, v_remaining, v_poi.position;
  END IF;

  IF NEW.storage_location_id IS NOT NULL THEN
    SELECT * INTO v_loc FROM public.storage_locations WHERE id = NEW.storage_location_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lagerplatz nicht gefunden'; END IF;
    IF v_loc.is_blocked THEN
      RAISE EXCEPTION 'Lagerplatz % ist gesperrt – Einlagerung nicht möglich', v_loc.code;
    END IF;
  END IF;

  SELECT s.code, s.name INTO v_supplier_lief_nr, v_supplier_name
  FROM public.purchase_orders po LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  WHERE po.id = v_poi.po_id;

  IF NEW.lot_no IS NOT NULL AND length(trim(NEW.lot_no)) > 0 THEN
    SELECT * INTO v_lot_existing FROM public.lots
    WHERE art_nr = v_poi.art_nr AND LOWER(lot_no) = LOWER(trim(NEW.lot_no)) FOR UPDATE;
    IF FOUND THEN
      v_lot_id := v_lot_existing.id;
      UPDATE public.lots
         SET total_received = total_received + NEW.qty_received,
             current_qty    = current_qty + NEW.qty_received,
             receipt_count  = receipt_count + 1,
             last_received_at = now(),
             last_gr_id     = NEW.gr_id,
             lot_no_ext     = COALESCE(NULLIF(trim(NEW.lot_no_ext),''), lot_no_ext),
             expiry_date    = COALESCE(NEW.expiry_date, expiry_date),
             supplier_lief_nr = COALESCE(supplier_lief_nr, v_supplier_lief_nr),
             supplier_name  = COALESCE(supplier_name, v_supplier_name),
             updated_by     = COALESCE(v_gr.received_by, auth.uid())
       WHERE id = v_lot_id;
    ELSE
      INSERT INTO public.lots (art_nr, lot_no, lot_no_ext, supplier_lief_nr, supplier_name,
        expiry_date, first_received_at, last_received_at, total_received, current_qty, receipt_count, last_gr_id, updated_by)
      VALUES (v_poi.art_nr, trim(NEW.lot_no), NULLIF(trim(NEW.lot_no_ext),''), v_supplier_lief_nr, v_supplier_name,
        NEW.expiry_date, now(), now(), NEW.qty_received, NEW.qty_received, 1, NEW.gr_id, COALESCE(v_gr.received_by, auth.uid()))
      RETURNING id INTO v_lot_id;
    END IF;
    NEW.lot_id := v_lot_id;
  END IF;

  INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, lot_no, note, created_by)
  VALUES (v_poi.art_nr, v_gr.warehouse_id, 'inbound', NEW.qty_received, v_poi.unit_price,
    'goods_receipt', NEW.gr_id, NULLIF(trim(NEW.lot_no),''),
    'WE ' || COALESCE(v_gr.gr_no,'') || ' · PO Pos ' || v_poi.position
      || CASE WHEN NEW.lot_no IS NOT NULL THEN ' · Charge ' || NEW.lot_no ELSE '' END
      || CASE WHEN v_loc.id IS NOT NULL THEN ' · LP ' || v_loc.code ELSE '' END,
    COALESCE(v_gr.received_by, auth.uid()))
  RETURNING id INTO v_mov_id;
  NEW.movement_id := v_mov_id;

  IF v_loc.id IS NOT NULL THEN
    INSERT INTO public.article_stock_locations (art_nr, lager, lagerpl, behaelter, charge_nr, charge_ext, bestand, me, datum_zu, source, updated_by)
    VALUES (v_poi.art_nr, v_loc.lager, v_loc.lagerpl, v_loc.behaelter,
      COALESCE(NULLIF(trim(NEW.lot_no),''),''), NULLIF(trim(NEW.lot_no_ext),''),
      NEW.qty_received, NULL, now(), 'goods_receipt', COALESCE(v_gr.received_by, auth.uid()))
    ON CONFLICT (art_nr, lager, lagerpl, behaelter, charge_nr) DO UPDATE
      SET bestand = public.article_stock_locations.bestand + EXCLUDED.bestand,
          datum_zu = now(), source = 'goods_receipt', updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;

  v_total_received := v_poi.qty_received + NEW.qty_received;
  UPDATE public.purchase_order_items SET qty_received = v_total_received, updated_at = now() WHERE id = v_poi.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._gi_require_staff() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_internal_user() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._gi_notify_lager(_title text, _body text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications (user_id, type, title, body, href)
  SELECT DISTINCT dm.user_id, 'goods_inspection', _title, _body, '/wareneingang-pruefung'
  FROM public.department_members dm
  WHERE dm.department_id IN ('b0000002-0000-0000-0000-000000000002','a0000001-0000-0000-0000-000000000002')
    AND dm.user_id <> coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- Ersetzt den Scan-Wareneingang: Zubuchung auf den i-Punkt, Prüfvorgang, Überlieferungsentscheidung
DROP FUNCTION IF EXISTS public.scan_goods_receipt(uuid, uuid, numeric, text, text);
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

  -- i-Punkt-Lagerplatz des Lagers (wird bei Bedarf angelegt)
  SELECT id INTO loc FROM public.storage_locations WHERE lager = wh.code AND lagerpl = 'I-PUNKT' LIMIT 1;
  IF loc IS NULL THEN
    INSERT INTO public.storage_locations(lager, lagerpl, behaelter, code, type, note, created_by)
    VALUES (wh.code, 'I-PUNKT', '0', wh.code || ' / I-PUNKT', 'sonstiges', 'Wareneingang vor Prüfung', auth.uid())
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

-- Stock between two concrete location rows of the same lager
CREATE OR REPLACE FUNCTION public._gi_move(_art text, _lot text, _from uuid, _to uuid, _qty numeric, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f public.storage_locations; t public.storage_locations; src public.article_stock_locations;
BEGIN
  SELECT * INTO f FROM public.storage_locations WHERE id = _from;
  SELECT * INTO t FROM public.storage_locations WHERE id = _to;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Lagerplatz nicht gefunden'; END IF;
  SELECT * INTO src FROM public.article_stock_locations
   WHERE art_nr = _art AND lager = f.lager AND lagerpl = f.lagerpl AND behaelter IS NOT DISTINCT FROM f.behaelter
     AND charge_nr = coalesce(_lot,'') FOR UPDATE;
  IF src.id IS NULL OR src.bestand < _qty THEN RAISE EXCEPTION 'Am Quellplatz % liegt nicht genug Bestand', f.code; END IF;
  UPDATE public.article_stock_locations SET bestand = bestand - _qty, datum_abg = current_date, updated_by = auth.uid(), updated_at = now() WHERE id = src.id;
  INSERT INTO public.article_stock_locations (art_nr, lager, lagerpl, behaelter, charge_nr, charge_ext, bestand, me, datum_zu, source, note, updated_by)
  VALUES (_art, t.lager, t.lagerpl, t.behaelter, coalesce(_lot,''), src.charge_ext, _qty, src.me, current_date, 'goods_inspection', _note, auth.uid())
  ON CONFLICT (art_nr, lager, lagerpl, behaelter, charge_nr) DO UPDATE
    SET bestand = public.article_stock_locations.bestand + EXCLUDED.bestand, datum_zu = current_date, updated_by = auth.uid(), updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.decide_goods_inspection(_id uuid, _ok boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.goods_inspections;
BEGIN
  PERFORM public._gi_require_staff();
  SELECT * INTO r FROM public.goods_inspections WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Prüfung nicht gefunden'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Prüfung ist bereits entschieden'; END IF;
  IF NOT _ok AND coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Bitte den Mangel beschreiben'; END IF;
  UPDATE public.goods_inspections SET status = CASE WHEN _ok THEN 'released' ELSE 'defect' END,
    note = nullif(trim(_note),''), decided_by = auth.uid(), decided_at = now() WHERE id = _id;
  IF r.case_id IS NOT NULL THEN
    UPDATE public.cases SET status = 'erledigt', closed_at = now(), closed_by = auth.uid(),
      closure_summary = CASE WHEN _ok THEN 'Freigegeben' ELSE 'Fehlerhaft: ' || _note END
     WHERE id = r.case_id AND status::text <> 'erledigt';
  END IF;
  PERFORM public._gi_notify_lager(
    CASE WHEN _ok THEN 'Einlagern: ' ELSE 'Fehlerhafte Lieferung: ' END || r.art_nr,
    r.qty || ' am i-Punkt ' || CASE WHEN _ok THEN 'freigegeben, bitte einlagern.' ELSE 'gesperrt bis Rücksendung. ' || _note END);
END $$;

CREATE OR REPLACE FUNCTION public.store_goods_inspection(_id uuid, _location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.goods_inspections; t public.storage_locations; wh public.warehouses;
BEGIN
  PERFORM public._gi_require_staff();
  SELECT * INTO r FROM public.goods_inspections WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Prüfung nicht gefunden'; END IF;
  IF r.status NOT IN ('released','defect') THEN RAISE EXCEPTION 'Einlagern erst nach Prüfentscheidung'; END IF;
  SELECT * INTO t FROM public.storage_locations WHERE id = _location_id;
  SELECT * INTO wh FROM public.warehouses WHERE id = r.warehouse_id;
  IF t.id IS NULL OR t.lager <> wh.code THEN RAISE EXCEPTION 'Lagerplatz muss im Lager % liegen', wh.code; END IF;
  IF t.id = r.ipunkt_location_id THEN RAISE EXCEPTION 'Bitte einen anderen Lagerplatz als den i-Punkt wählen'; END IF;
  IF r.status = 'released' AND t.is_blocked THEN RAISE EXCEPTION 'Freigegebene Ware nicht auf einen Sperrplatz'; END IF;
  PERFORM public._gi_move(r.art_nr, r.lot_no, r.ipunkt_location_id, t.id, r.qty,
    CASE WHEN r.status='defect' THEN 'Fehlerhaft, bis Rücksendung: ' || coalesce(r.note,'') END);
  UPDATE public.goods_inspections SET status = CASE WHEN r.status='released' THEN 'stored' ELSE 'defect_stored' END,
    stored_location_id = t.id, stored_by = auth.uid(), stored_at = now() WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.return_goods_inspection(_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.goods_inspections; f public.storage_locations;
BEGIN
  PERFORM public._gi_require_staff();
  SELECT * INTO r FROM public.goods_inspections WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Prüfung nicht gefunden'; END IF;
  IF r.status NOT IN ('defect','defect_stored') THEN RAISE EXCEPTION 'Nur fehlerhafte Lieferungen können zurückgesendet werden'; END IF;
  SELECT * INTO f FROM public.storage_locations WHERE id = coalesce(r.stored_location_id, r.ipunkt_location_id);
  UPDATE public.article_stock_locations SET bestand = bestand - r.qty, datum_abg = current_date, updated_by = auth.uid(), updated_at = now()
   WHERE art_nr = r.art_nr AND lager = f.lager AND lagerpl = f.lagerpl AND behaelter IS NOT DISTINCT FROM f.behaelter
     AND charge_nr = coalesce(r.lot_no,'') AND bestand >= r.qty;
  IF NOT FOUND THEN RAISE EXCEPTION 'Am Lagerplatz % liegt nicht genug Bestand', f.code; END IF;
  INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, lot_no, note, created_by)
  VALUES (r.art_nr, r.warehouse_id, 'outbound', r.qty, 'goods_return', r.gr_id, r.lot_no,
    'Rücksendung fehlerhafte Lieferung' || coalesce(' · ' || nullif(trim(_note),''), ''), auth.uid());
  UPDATE public.goods_inspections SET status = 'returned', returned_by = auth.uid(), returned_at = now(),
    note = concat_ws(E'\n', note, nullif(trim(_note),'')) WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public._gi_move(text,text,uuid,uuid,numeric,text), public._gi_notify_lager(text,text), public._gi_require_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_goods_receipt(uuid,uuid,numeric,text,text,text), public.decide_goods_inspection(uuid,boolean,text),
  public.store_goods_inspection(uuid,uuid), public.return_goods_inspection(uuid,text) TO authenticated;