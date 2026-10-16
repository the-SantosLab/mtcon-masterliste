CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_no text UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','posted','cancelled')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid,
  posted_at timestamptz
);
CREATE TABLE public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE RESTRICT,
  expected_qty numeric(14,3) NOT NULL DEFAULT 0,
  counted_qty numeric(14,3),
  posted_delta numeric(14,3),
  note text,
  counted_by uuid,
  counted_at timestamptz,
  UNIQUE (count_id, art_nr)
);
CREATE INDEX idx_stock_count_items_count ON public.stock_count_items(count_id);
GRANT SELECT ON public.stock_counts TO authenticated;
GRANT SELECT, UPDATE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
GRANT ALL ON public.stock_count_items TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_counts_read ON public.stock_counts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY stock_count_items_read ON public.stock_count_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY stock_count_items_count ON public.stock_count_items FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
         AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = count_id AND c.status = 'counting'))
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
         AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = count_id AND c.status = 'counting'));

-- Only count fields may change via the client
CREATE OR REPLACE FUNCTION public.guard_stock_count_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.stock_count_posting', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.count_id <> OLD.count_id OR NEW.art_nr <> OLD.art_nr OR NEW.expected_qty <> OLD.expected_qty
     OR NEW.posted_delta IS DISTINCT FROM OLD.posted_delta THEN
    RAISE EXCEPTION 'Nur Zählmenge und Notiz sind änderbar';
  END IF;
  IF NEW.counted_qty IS NOT NULL AND NEW.counted_qty < 0 THEN RAISE EXCEPTION 'Zählmenge darf nicht negativ sein'; END IF;
  NEW.counted_by := auth.uid(); NEW.counted_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_stock_count_item BEFORE UPDATE ON public.stock_count_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_stock_count_item();

CREATE OR REPLACE FUNCTION public.create_stock_count(_warehouse_id uuid, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_no text; v_year text := to_char(now(),'YYYY');
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE warehouse_id = _warehouse_id AND status = 'counting') THEN
    RAISE EXCEPTION 'Für dieses Lager läuft bereits eine Inventur';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('stock_count_no'));
  SELECT 'INV-'||v_year||'-'||lpad((COALESCE(MAX(split_part(count_no,'-',3)::int),0)+1)::text,4,'0')
    INTO v_no FROM public.stock_counts WHERE count_no LIKE 'INV-'||v_year||'-%';
  INSERT INTO public.stock_counts (count_no, warehouse_id, note, created_by)
  VALUES (v_no, _warehouse_id, _note, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.stock_count_items (count_id, art_nr, expected_qty)
  SELECT v_id, s.art_nr, s.quantity FROM public.inventory_stock s
   WHERE s.warehouse_id = _warehouse_id AND s.quantity <> 0;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.add_stock_count_item(_count_id uuid, _art_nr text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.stock_counts%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO c FROM public.stock_counts WHERE id = _count_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'counting' THEN RAISE EXCEPTION 'Inventur ist nicht offen'; END IF;
  INSERT INTO public.stock_count_items (count_id, art_nr, expected_qty)
  SELECT _count_id, _art_nr, COALESCE((SELECT quantity FROM public.inventory_stock WHERE warehouse_id = c.warehouse_id AND art_nr = _art_nr),0)
  ON CONFLICT (count_id, art_nr) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_count(_count_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.stock_counts%ROWTYPE; r record; v_cur numeric; v_delta numeric; n int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen eine Inventur buchen'; END IF;
  SELECT * INTO c FROM public.stock_counts WHERE id = _count_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'counting' THEN RAISE EXCEPTION 'Inventur ist nicht offen'; END IF;
  IF EXISTS (SELECT 1 FROM public.stock_count_items WHERE count_id = _count_id AND counted_qty IS NULL) THEN
    RAISE EXCEPTION 'Es sind noch nicht alle Positionen gezählt';
  END IF;
  PERFORM set_config('app.stock_count_posting','on',true);
  FOR r IN SELECT * FROM public.stock_count_items WHERE count_id = _count_id LOOP
    SELECT COALESCE(quantity,0) INTO v_cur FROM public.inventory_stock
     WHERE warehouse_id = c.warehouse_id AND art_nr = r.art_nr FOR UPDATE;
    v_delta := r.counted_qty - COALESCE(v_cur,0);
    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, note, created_by)
      VALUES (r.art_nr, c.warehouse_id, 'adjustment', v_delta, 'stock_count', _count_id, 'Inventur '||c.count_no, auth.uid());
      n := n + 1;
    END IF;
    UPDATE public.stock_count_items SET posted_delta = v_delta WHERE id = r.id;
  END LOOP;
  UPDATE public.stock_counts SET status = 'posted', posted_by = auth.uid(), posted_at = now() WHERE id = _count_id;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(_count_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen eine Inventur abbrechen'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled' WHERE id = _count_id AND status = 'counting';
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventur ist nicht offen'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.create_stock_count(uuid,text), public.add_stock_count_item(uuid,text), public.post_stock_count(uuid), public.cancel_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_count(uuid,text), public.add_stock_count_item(uuid,text), public.post_stock_count(uuid), public.cancel_stock_count(uuid) TO authenticated;

-- Invoice matching: compare against value of goods actually received
CREATE OR REPLACE FUNCTION public.match_supplier_invoice(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.supplier_invoices%ROWTYPE;
  po_total numeric(14,2) := 0;
  gr_value numeric(14,2) := 0;
  gr_total numeric(14,3) := 0;
  inv_total numeric(14,2) := 0;
  inv_net numeric(14,2) := 0;
  diff numeric(14,2);
  ms text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  SELECT * INTO inv FROM public.supplier_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not found'); END IF;
  inv_total := COALESCE(inv.total_amount, 0);
  inv_net := COALESCE(inv.subtotal_amount, inv.total_amount - COALESCE(inv.tax_amount,0), 0);

  IF inv.po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(qty_ordered * COALESCE(unit_price,0)), 0) INTO po_total
      FROM public.purchase_order_items WHERE po_id = inv.po_id;
    SELECT COALESCE(SUM(gri.qty_received), 0),
           COALESCE(SUM(gri.qty_received * COALESCE(poi.unit_price,0)), 0)
      INTO gr_total, gr_value
      FROM public.goods_receipt_items gri
      JOIN public.goods_receipts gr ON gr.id = gri.gr_id
      LEFT JOIN public.purchase_order_items poi ON poi.id = gri.po_item_id
     WHERE gr.po_id = inv.po_id;
  END IF;

  UPDATE public.supplier_invoice_items sii
     SET match_status = CASE
       WHEN ABS(COALESCE(sii.unit_price,0) - COALESCE(poi.unit_price,0)) > 0.01 THEN 'price_diff'
       WHEN sii.quantity > COALESCE((SELECT SUM(qty_received) FROM public.goods_receipt_items WHERE po_item_id = sii.po_item_id),0) THEN 'qty_over_gr'
       ELSE 'ok' END
    FROM public.purchase_order_items poi
   WHERE sii.invoice_id = _invoice_id AND poi.id = sii.po_item_id;
  UPDATE public.supplier_invoice_items SET match_status = 'unmatched'
   WHERE invoice_id = _invoice_id AND po_item_id IS NULL;

  diff := inv_net - gr_value;
  IF inv.po_id IS NULL THEN ms := 'no_po';
  ELSIF gr_total = 0 THEN ms := 'no_gr';
  ELSIF EXISTS (SELECT 1 FROM public.supplier_invoice_items WHERE invoice_id = _invoice_id AND match_status IN ('price_diff','qty_over_gr','unmatched')) THEN ms := 'item_diff';
  ELSIF ABS(diff) <= 0.5 THEN ms := 'ok';
  ELSE ms := 'amount_diff';
  END IF;

  UPDATE public.supplier_invoices
     SET match_status = ms, match_diff = diff,
         status = CASE WHEN status = 'open' AND ms = 'ok' THEN 'matched'::public.supplier_invoice_status ELSE status END
   WHERE id = _invoice_id;

  RETURN jsonb_build_object('match_status', ms, 'diff', diff, 'po_total', po_total, 'gr_total', gr_total, 'gr_value', gr_value, 'invoice_net', inv_net, 'invoice_total', inv_total);
END $$;