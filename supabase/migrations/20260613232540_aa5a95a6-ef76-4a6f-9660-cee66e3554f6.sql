
-- 1) lots table
CREATE TABLE IF NOT EXISTS public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL,
  lot_no text NOT NULL,
  lot_no_ext text,
  supplier_lief_nr text,
  supplier_name text,
  expiry_date date,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  total_received numeric(14,3) NOT NULL DEFAULT 0,
  current_qty numeric(14,3) NOT NULL DEFAULT 0,
  receipt_count int NOT NULL DEFAULT 0,
  last_gr_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'blocked' | 'consumed'
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS lots_art_lot_unique
  ON public.lots (art_nr, LOWER(lot_no));
CREATE INDEX IF NOT EXISTS lots_art_idx ON public.lots (art_nr);
CREATE INDEX IF NOT EXISTS lots_status_idx ON public.lots (status);
CREATE INDEX IF NOT EXISTS lots_expiry_idx ON public.lots (expiry_date);

GRANT SELECT ON public.lots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lots read"
  ON public.lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "lots insert"
  ON public.lots FOR INSERT TO authenticated
  WITH CHECK (public.check_is_admin(auth.uid()) OR public.has_role(auth.uid(),'staff'::app_role));
CREATE POLICY "lots update"
  ON public.lots FOR UPDATE TO authenticated
  USING (public.check_is_admin(auth.uid()) OR public.has_role(auth.uid(),'staff'::app_role))
  WITH CHECK (public.check_is_admin(auth.uid()) OR public.has_role(auth.uid(),'staff'::app_role));
CREATE POLICY "lots delete"
  ON public.lots FOR DELETE TO authenticated
  USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER lots_touch_updated BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) extend goods_receipt_items
ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS lot_no_ext text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL;

-- 3) duplicate-check helper for UI
CREATE OR REPLACE FUNCTION public.find_duplicate_lots(_art_nr text, _lot_no text)
RETURNS TABLE(
  id uuid, art_nr text, lot_no text, lot_no_ext text, supplier_lief_nr text,
  supplier_name text, expiry_date date, current_qty numeric, total_received numeric,
  first_received_at timestamptz, last_received_at timestamptz, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, art_nr, lot_no, lot_no_ext, supplier_lief_nr,
         supplier_name, expiry_date, current_qty, total_received,
         first_received_at, last_received_at, status
  FROM public.lots
  WHERE art_nr = _art_nr
    AND LOWER(lot_no) = LOWER(_lot_no)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.find_duplicate_lots(text,text) TO authenticated;

-- 4) replace goods receipt trigger function (incl. lot upsert)
CREATE OR REPLACE FUNCTION public.process_goods_receipt_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Lagerbewegung erzeugen (mit Chargen-Nr)
  INSERT INTO public.stock_movements (
    art_nr, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, lot_no, note, created_by
  ) VALUES (
    v_poi.art_nr, v_gr.warehouse_id, 'inbound', NEW.qty_received, v_poi.unit_price,
    'goods_receipt', NEW.gr_id, NULLIF(trim(NEW.lot_no),''),
    'WE ' || COALESCE(v_gr.gr_no,'') || ' · PO Pos ' || v_poi.position
      || CASE WHEN NEW.lot_no IS NOT NULL THEN ' · Charge ' || NEW.lot_no ELSE '' END,
    COALESCE(v_gr.received_by, auth.uid())
  ) RETURNING id INTO v_mov_id;

  NEW.movement_id := v_mov_id;

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
