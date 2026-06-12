
-- ============== SUPPLIERS ==============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_write ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== PURCHASE ORDERS ==============
CREATE TYPE public.po_status AS ENUM ('draft','ordered','partial','received','cancelled');

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.po_status NOT NULL DEFAULT 'draft',
  ordered_at date,
  expected_at date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_read ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY po_insert ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY po_update ON public.purchase_orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY po_delete ON public.purchase_orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-Nummer PO-YYYY-NNNN
CREATE OR REPLACE FUNCTION public.assign_po_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_year text; v_counter int;
BEGIN
  IF NEW.po_no IS NULL THEN
    v_year := to_char(now(),'YYYY');
    v_counter := public.next_counter('po_'||v_year);
    NEW.po_no := 'PO-'||v_year||'-'||lpad(v_counter::text,4,'0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_po_no BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_po_number();

-- ============== PURCHASE ORDER ITEMS ==============
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 10,
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE RESTRICT,
  description text,
  qty_ordered numeric(14,3) NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_items_po ON public.purchase_order_items(po_id);
CREATE INDEX idx_po_items_art ON public.purchase_order_items(art_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY poi_read ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY poi_insert ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY poi_update ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY poi_delete ON public.purchase_order_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_poi_updated BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== GOODS RECEIPTS ==============
CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_no text UNIQUE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  delivery_note_no text,
  notes text,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gr_po ON public.goods_receipts(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY gr_read ON public.goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY gr_insert ON public.goods_receipts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY gr_update ON public.goods_receipts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY gr_delete ON public.goods_receipts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_gr_updated BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_gr_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_year text; v_counter int;
BEGIN
  IF NEW.gr_no IS NULL THEN
    v_year := to_char(now(),'YYYY');
    v_counter := public.next_counter('gr_'||v_year);
    NEW.gr_no := 'WE-'||v_year||'-'||lpad(v_counter::text,4,'0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_gr_no BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.assign_gr_number();

-- ============== GOODS RECEIPT ITEMS ==============
CREATE TABLE public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  qty_received numeric(14,3) NOT NULL CHECK (qty_received > 0),
  movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gri_gr ON public.goods_receipt_items(gr_id);
CREATE INDEX idx_gri_poi ON public.goods_receipt_items(po_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY gri_read ON public.goods_receipt_items FOR SELECT TO authenticated USING (true);
CREATE POLICY gri_insert ON public.goods_receipt_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY gri_update ON public.goods_receipt_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY gri_delete ON public.goods_receipt_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- ============== TRIGGER: Wareneingang verbucht ==============
CREATE OR REPLACE FUNCTION public.process_goods_receipt_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_poi public.purchase_order_items%ROWTYPE;
  v_gr  public.goods_receipts%ROWTYPE;
  v_remaining numeric(14,3);
  v_mov_id uuid;
  v_po_id uuid;
  v_total_ordered numeric(14,3);
  v_total_received numeric(14,3);
BEGIN
  SELECT * INTO v_poi FROM public.purchase_order_items WHERE id = NEW.po_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO-Position nicht gefunden'; END IF;
  SELECT * INTO v_gr FROM public.goods_receipts WHERE id = NEW.gr_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wareneingang nicht gefunden'; END IF;

  -- Validierung Teilbelieferung
  v_remaining := v_poi.qty_ordered - v_poi.qty_received;
  IF NEW.qty_received > v_remaining THEN
    RAISE EXCEPTION 'Erfasste Menge (%) überschreitet offene Menge (%) für Position %',
      NEW.qty_received, v_remaining, v_poi.position;
  END IF;

  -- Lagerbewegung erzeugen
  INSERT INTO public.stock_movements (
    art_nr, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, note, created_by
  ) VALUES (
    v_poi.art_nr, v_gr.warehouse_id, 'inbound', NEW.qty_received, v_poi.unit_price,
    'goods_receipt', NEW.gr_id,
    'WE ' || COALESCE(v_gr.gr_no,'') || ' · PO Pos ' || v_poi.position,
    COALESCE(v_gr.received_by, auth.uid())
  ) RETURNING id INTO v_mov_id;

  NEW.movement_id := v_mov_id;

  -- PO-Position: gelieferte Menge erhöhen
  UPDATE public.purchase_order_items
     SET qty_received = qty_received + NEW.qty_received,
         updated_at = now()
   WHERE id = NEW.po_item_id;

  -- PO-Status neu berechnen
  v_po_id := v_poi.po_id;
  SELECT COALESCE(SUM(qty_ordered),0), COALESCE(SUM(qty_received),0)
    INTO v_total_ordered, v_total_received
    FROM public.purchase_order_items WHERE po_id = v_po_id;

  IF v_total_received >= v_total_ordered AND v_total_ordered > 0 THEN
    UPDATE public.purchase_orders SET status = 'received', updated_at = now() WHERE id = v_po_id;
  ELSIF v_total_received > 0 THEN
    UPDATE public.purchase_orders SET status = 'partial', updated_at = now() WHERE id = v_po_id;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_process_gri BEFORE INSERT ON public.goods_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.process_goods_receipt_item();
