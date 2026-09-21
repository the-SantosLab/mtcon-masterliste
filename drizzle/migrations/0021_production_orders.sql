-- Werkstattaufträge (Produktion) mit Stücklisten-Buchungslogik

CREATE TABLE public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no TEXT,
  art_nr TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  quantity_done NUMERIC NOT NULL DEFAULT 0,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft',
  planned_start DATE,
  planned_end DATE,
  lot_no TEXT,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  note TEXT,
  issued_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT production_orders_status_check CHECK (status IN ('draft','released','issued','completed','cancelled')),
  CONSTRAINT production_orders_qty_check CHECK (quantity > 0)
);
CREATE UNIQUE INDEX production_orders_wo_no_key ON public.production_orders (wo_no) WHERE wo_no IS NOT NULL;
CREATE INDEX production_orders_status_idx ON public.production_orders (status, created_at DESC);

CREATE TABLE public.production_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  pos TEXT,
  component_art_nr TEXT NOT NULL,
  description TEXT,
  qty_per_unit NUMERIC NOT NULL DEFAULT 1,
  qty_required NUMERIC NOT NULL DEFAULT 0,
  qty_issued NUMERIC NOT NULL DEFAULT 0,
  me TEXT,
  lot_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX production_order_items_po_idx ON public.production_order_items (production_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_items TO authenticated;
GRANT ALL ON public.production_order_items TO service_role;

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal read production_orders" ON public.production_orders
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write production_orders" ON public.production_orders
  FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
CREATE POLICY "internal read production_order_items" ON public.production_order_items
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write production_order_items" ON public.production_order_items
  FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- Nummernvergabe WA-YYYY-nnnn
CREATE OR REPLACE FUNCTION public.assign_wo_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_year text; v_counter int;
BEGIN
  IF NEW.wo_no IS NULL OR NEW.wo_no = '' THEN
    v_year := to_char(now(),'YYYY');
    v_counter := public.next_counter('wo_'||v_year);
    NEW.wo_no := 'WA-'||v_year||'-'||lpad(v_counter::text,4,'0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_assign_wo_no BEFORE INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_wo_no();

CREATE OR REPLACE FUNCTION public.touch_production_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_production_order BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_production_order();

-- Werkstattauftrag aus Stückliste anlegen
CREATE OR REPLACE FUNCTION public.create_production_order(
  _art_nr TEXT,
  _quantity NUMERIC,
  _warehouse_id UUID,
  _note TEXT DEFAULT NULL,
  _case_id UUID DEFAULT NULL,
  _order_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID; v_desc TEXT; v_cnt INT;
BEGIN
  IF NOT public.is_internal_user() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Menge muss größer 0 sein'; END IF;

  SELECT bezeich_1 INTO v_desc FROM public.articles WHERE art_nr = _art_nr LIMIT 1;

  INSERT INTO public.production_orders (art_nr, description, quantity, warehouse_id, note, case_id, order_id, created_by)
  VALUES (_art_nr, v_desc, _quantity, _warehouse_id, _note, _case_id, _order_id, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.production_order_items (production_order_id, pos, component_art_nr, description, qty_per_unit, qty_required, me)
  SELECT v_id, b.pos, b.component_art_nr,
         COALESCE(b.component_bezeichnung, b.component_matchcode),
         COALESCE(NULLIF(b.menge,0), 1),
         COALESCE(NULLIF(b.menge,0), 1) * _quantity,
         b.me
  FROM public.article_bom b
  WHERE b.parent_art_nr = _art_nr;

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'Für Artikel % ist keine Stückliste hinterlegt', _art_nr;
  END IF;

  RETURN v_id;
END; $$;

-- Einzelteile ausbuchen (Materialentnahme)
CREATE OR REPLACE FUNCTION public.production_order_issue(_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE wo public.production_orders; it RECORD; v_open NUMERIC; v_count INT := 0;
BEGIN
  IF NOT public.is_internal_user() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO wo FROM public.production_orders WHERE id = _id FOR UPDATE;
  IF wo.id IS NULL THEN RAISE EXCEPTION 'Werkstattauftrag nicht gefunden'; END IF;
  IF wo.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Werkstattauftrag ist abgeschlossen'; END IF;

  FOR it IN SELECT * FROM public.production_order_items WHERE production_order_id = _id LOOP
    v_open := it.qty_required - it.qty_issued;
    CONTINUE WHEN v_open <= 0;

    INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, lot_no, note, created_by, case_id, order_id)
    VALUES (it.component_art_nr, wo.warehouse_id, 'outbound', v_open, 'production_order', wo.id, it.lot_no,
            'Materialentnahme '||COALESCE(wo.wo_no,'')||' · '||wo.art_nr, auth.uid(), wo.case_id, wo.order_id);

    UPDATE public.production_order_items SET qty_issued = it.qty_required WHERE id = it.id;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.production_orders
     SET status = 'issued', issued_at = COALESCE(issued_at, now())
   WHERE id = _id;

  RETURN jsonb_build_object('issued_positions', v_count);
END; $$;

-- Fertigteil einbuchen
CREATE OR REPLACE FUNCTION public.production_order_complete(_id UUID, _qty NUMERIC DEFAULT NULL, _lot_no TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE wo public.production_orders; v_qty NUMERIC; v_missing INT; v_total NUMERIC;
BEGIN
  IF NOT public.is_internal_user() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO wo FROM public.production_orders WHERE id = _id FOR UPDATE;
  IF wo.id IS NULL THEN RAISE EXCEPTION 'Werkstattauftrag nicht gefunden'; END IF;
  IF wo.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Werkstattauftrag ist bereits abgeschlossen'; END IF;

  SELECT count(*) INTO v_missing FROM public.production_order_items
   WHERE production_order_id = _id AND qty_issued < qty_required;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Es sind noch % Positionen nicht ausgebucht', v_missing;
  END IF;

  v_qty := COALESCE(_qty, wo.quantity - wo.quantity_done);
  IF v_qty <= 0 THEN RAISE EXCEPTION 'Menge muss größer 0 sein'; END IF;
  IF wo.quantity_done + v_qty > wo.quantity THEN
    RAISE EXCEPTION 'Mehr als die Auftragsmenge kann nicht eingebucht werden';
  END IF;

  INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, lot_no, note, created_by, case_id, order_id)
  VALUES (wo.art_nr, wo.warehouse_id, 'inbound', v_qty, 'production_order', wo.id, COALESCE(_lot_no, wo.lot_no),
          'Fertigmeldung '||COALESCE(wo.wo_no,''), auth.uid(), wo.case_id, wo.order_id);

  v_total := wo.quantity_done + v_qty;
  UPDATE public.production_orders
     SET quantity_done = v_total,
         lot_no = COALESCE(_lot_no, lot_no),
         status = CASE WHEN v_total >= quantity THEN 'completed' ELSE status END,
         completed_at = CASE WHEN v_total >= quantity THEN now() ELSE completed_at END
   WHERE id = _id;

  RETURN jsonb_build_object('received', v_qty, 'done', v_total);
END; $$;
