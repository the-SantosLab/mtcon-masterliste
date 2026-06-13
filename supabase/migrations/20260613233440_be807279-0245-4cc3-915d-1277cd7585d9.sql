
-- 1) Column for chosen location on a GR line
ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS storage_location_id uuid REFERENCES public.storage_locations(id);

-- 2) Replace trigger function to upsert into article_stock_locations when location is given
CREATE OR REPLACE FUNCTION public.process_goods_receipt_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_poi public.purchase_order_items%ROWTYPE;
  v_gr  public.goods_receipts%ROWTYPE;
  v_remaining numeric(14,3);
  v_mov_id uuid;
  v_total_ordered numeric(14,3);
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
  IF NEW.qty_received > v_remaining THEN
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

  -- Lieferant der PO ermitteln (für Lot-Metadaten)
  SELECT s.code, s.name INTO v_supplier_lief_nr, v_supplier_name
  FROM public.purchase_orders po
  LEFT JOIN public.suppliers s ON s.id = po.supplier_id
  WHERE po.id = v_poi.po_id;

  -- Charge: existiert sie schon? -> Update; sonst Insert
  IF NEW.lot_no IS NOT NULL AND length(trim(NEW.lot_no)) > 0 THEN
    SELECT * INTO v_lot_existing
    FROM public.lots
    WHERE art_nr = v_poi.art_nr
      AND LOWER(lot_no) = LOWER(trim(NEW.lot_no))
    FOR UPDATE;

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
      INSERT INTO public.lots (
        art_nr, lot_no, lot_no_ext, supplier_lief_nr, supplier_name,
        expiry_date, first_received_at, last_received_at,
        total_received, current_qty, receipt_count, last_gr_id, updated_by
      ) VALUES (
        v_poi.art_nr,
        trim(NEW.lot_no),
        NULLIF(trim(NEW.lot_no_ext),''),
        v_supplier_lief_nr, v_supplier_name,
        NEW.expiry_date, now(), now(),
        NEW.qty_received, NEW.qty_received, 1, NEW.gr_id,
        COALESCE(v_gr.received_by, auth.uid())
      )
      RETURNING id INTO v_lot_id;
    END IF;

    NEW.lot_id := v_lot_id;
  END IF;

  -- Lagerbewegung
  INSERT INTO public.stock_movements (
    art_nr, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, lot_no, note, created_by
  ) VALUES (
    v_poi.art_nr, v_gr.warehouse_id, 'inbound', NEW.qty_received, v_poi.unit_price,
    'goods_receipt', NEW.gr_id, NULLIF(trim(NEW.lot_no),''),
    'WE ' || COALESCE(v_gr.gr_no,'') || ' · PO Pos ' || v_poi.position
      || CASE WHEN NEW.lot_no IS NOT NULL THEN ' · Charge ' || NEW.lot_no ELSE '' END
      || CASE WHEN v_loc.id IS NOT NULL THEN ' · LP ' || v_loc.code ELSE '' END,
    COALESCE(v_gr.received_by, auth.uid())
  ) RETURNING id INTO v_mov_id;

  NEW.movement_id := v_mov_id;

  -- Artikel-Stockbestand pro Lagerplatz upserten
  IF v_loc.id IS NOT NULL THEN
    INSERT INTO public.article_stock_locations (
      art_nr, lager, lagerpl, behaelter, charge_nr, charge_ext, bestand, me, datum_zu, source, updated_by
    ) VALUES (
      v_poi.art_nr, v_loc.lager, v_loc.lagerpl, v_loc.behaelter,
      COALESCE(NULLIF(trim(NEW.lot_no),''),''), NULLIF(trim(NEW.lot_no_ext),''),
      NEW.qty_received, NULL, now(), 'goods_receipt',
      COALESCE(v_gr.received_by, auth.uid())
    )
    ON CONFLICT (art_nr, lager, lagerpl, behaelter, charge_nr) DO UPDATE
      SET bestand   = public.article_stock_locations.bestand + EXCLUDED.bestand,
          datum_zu  = now(),
          source    = 'goods_receipt',
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
  END IF;

  -- PO-Position fortschreiben
  v_total_received := v_poi.qty_received + NEW.qty_received;
  v_total_ordered  := v_poi.qty_ordered;
  UPDATE public.purchase_order_items
     SET qty_received = v_total_received,
         updated_at = now()
   WHERE id = v_poi.id;

  RETURN NEW;
END;
$function$;

-- 3) Suggestion function
CREATE OR REPLACE FUNCTION public.suggest_storage_locations(_art_nr text)
RETURNS TABLE(
  id uuid,
  code text,
  lager text,
  lagerpl text,
  behaelter text,
  type storage_location_type,
  fifo_required boolean,
  current_bestand numeric,
  capacity numeric,
  reason text,
  score int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH existing AS (
    SELECT sl.id, sl.code, sl.lager, sl.lagerpl, sl.behaelter, sl.type, sl.fifo_required, sl.capacity,
           COALESCE(SUM(asl.bestand), 0) AS current_bestand,
           'Artikel ist hier bereits gelagert'::text AS reason,
           100 AS score
    FROM public.storage_locations sl
    JOIN public.article_stock_locations asl
      ON asl.lager = sl.lager AND asl.lagerpl = sl.lagerpl AND asl.behaelter = sl.behaelter
    WHERE asl.art_nr = _art_nr AND sl.is_blocked = false
    GROUP BY sl.id
  ),
  empty_slots AS (
    SELECT sl.id, sl.code, sl.lager, sl.lagerpl, sl.behaelter, sl.type, sl.fifo_required, sl.capacity,
           0::numeric AS current_bestand,
           ('Freier ' || sl.type::text || '-Platz') AS reason,
           CASE sl.type WHEN 'kanban' THEN 70 WHEN 'regal' THEN 60 ELSE 30 END AS score
    FROM public.storage_locations sl
    WHERE sl.is_blocked = false
      AND sl.type IN ('regal','kanban')
      AND NOT EXISTS (
        SELECT 1 FROM public.article_stock_locations asl2
        WHERE asl2.lager = sl.lager AND asl2.lagerpl = sl.lagerpl AND asl2.behaelter = sl.behaelter
          AND asl2.bestand > 0
      )
  ),
  unioned AS (
    SELECT * FROM existing
    UNION ALL
    SELECT * FROM empty_slots WHERE id NOT IN (SELECT id FROM existing)
  )
  SELECT id, code, lager, lagerpl, behaelter, type, fifo_required, current_bestand, capacity, reason, score
  FROM unioned
  ORDER BY score DESC, lager, lagerpl, behaelter
  LIMIT 8;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_storage_locations(text) TO authenticated;
