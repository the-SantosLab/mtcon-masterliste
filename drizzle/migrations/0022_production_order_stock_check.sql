CREATE OR REPLACE FUNCTION public.production_order_availability(_id UUID)
RETURNS TABLE(item_id UUID, pos TEXT, component_art_nr TEXT, description TEXT, qty_open NUMERIC, qty_available NUMERIC, shortage NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id,
         i.pos::text,
         i.component_art_nr,
         i.description,
         GREATEST(i.qty_required - i.qty_issued, 0) AS qty_open,
         COALESCE(av.qty, 0) AS qty_available,
         GREATEST(GREATEST(i.qty_required - i.qty_issued, 0) - COALESCE(av.qty, 0), 0) AS shortage
    FROM public.production_order_items i
    JOIN public.production_orders wo ON wo.id = i.production_order_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(s.quantity), 0) AS qty
        FROM public.inventory_stock s
       WHERE s.art_nr = i.component_art_nr
         AND (wo.warehouse_id IS NULL OR s.warehouse_id = wo.warehouse_id)
    ) av ON TRUE
   WHERE i.production_order_id = _id
     AND public.is_internal_user()
   ORDER BY i.pos, i.component_art_nr;
$$;

GRANT EXECUTE ON FUNCTION public.production_order_availability(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.production_order_issue(_id UUID, _allow_partial BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  wo public.production_orders;
  it RECORD;
  v_open NUMERIC;
  v_avail NUMERIC;
  v_take NUMERIC;
  v_count INT := 0;
  v_short INT := 0;
  v_short_list TEXT := '';
BEGIN
  IF NOT public.is_internal_user() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO wo FROM public.production_orders WHERE id = _id FOR UPDATE;
  IF wo.id IS NULL THEN RAISE EXCEPTION 'Werkstattauftrag nicht gefunden'; END IF;
  IF wo.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Werkstattauftrag ist abgeschlossen'; END IF;

  IF NOT _allow_partial THEN
    SELECT count(*), string_agg(a.component_art_nr || ' (fehlt ' || trim(to_char(a.shortage,'FM999999990.###')) || ')', ', ')
      INTO v_short, v_short_list
      FROM public.production_order_availability(_id) a
     WHERE a.shortage > 0;
    IF v_short > 0 THEN
      RAISE EXCEPTION 'Nicht genug Bestand für % Position(en): %', v_short, left(COALESCE(v_short_list,''), 400);
    END IF;
    v_short := 0;
  END IF;

  FOR it IN SELECT * FROM public.production_order_items WHERE production_order_id = _id ORDER BY pos LOOP
    v_open := it.qty_required - it.qty_issued;
    CONTINUE WHEN v_open <= 0;

    SELECT COALESCE(sum(s.quantity), 0) INTO v_avail
      FROM public.inventory_stock s
     WHERE s.art_nr = it.component_art_nr
       AND (wo.warehouse_id IS NULL OR s.warehouse_id = wo.warehouse_id);

    v_take := LEAST(v_open, GREATEST(v_avail, 0));
    IF v_take <= 0 THEN
      v_short := v_short + 1;
      CONTINUE;
    END IF;
    IF v_take < v_open THEN v_short := v_short + 1; END IF;

    INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, lot_no, note, created_by, case_id, order_id)
    VALUES (it.component_art_nr, wo.warehouse_id, 'outbound', v_take, 'production_order', wo.id, it.lot_no,
            'Materialentnahme '||COALESCE(wo.wo_no,'')||' · '||wo.art_nr, auth.uid(), wo.case_id, wo.order_id);

    UPDATE public.production_order_items SET qty_issued = it.qty_issued + v_take WHERE id = it.id;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.production_orders
     SET status = CASE WHEN v_count > 0 THEN 'issued' ELSE status END,
         issued_at = CASE WHEN v_count > 0 THEN COALESCE(issued_at, now()) ELSE issued_at END
   WHERE id = _id;

  RETURN jsonb_build_object('issued_positions', v_count, 'short_positions', v_short);
END; $$;

GRANT EXECUTE ON FUNCTION public.production_order_issue(UUID, BOOLEAN) TO authenticated;