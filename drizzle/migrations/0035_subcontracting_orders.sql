CREATE TABLE public.subcontract_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text NOT NULL UNIQUE DEFAULT ('FB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id), warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partial','completed','cancelled')),
 expected_at date, note text, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subcontract_orders TO authenticated;
GRANT ALL ON public.subcontract_orders TO service_role;
ALTER TABLE public.subcontract_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY subcontract_read ON public.subcontract_orders FOR SELECT TO authenticated USING (public.is_internal_user() AND public.has_erp_access(auth.uid()));
CREATE TABLE public.subcontract_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.subcontract_orders(id),
 art_nr text NOT NULL REFERENCES public.articles(art_nr), description text, quantity numeric NOT NULL CHECK(quantity>0),
 qty_issued numeric NOT NULL DEFAULT 0, qty_returned numeric NOT NULL DEFAULT 0,
 CHECK(qty_issued>=0 AND qty_issued<=quantity AND qty_returned>=0 AND qty_returned<=qty_issued)
);
GRANT SELECT ON public.subcontract_order_items TO authenticated;
GRANT ALL ON public.subcontract_order_items TO service_role;
ALTER TABLE public.subcontract_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY subcontract_items_read ON public.subcontract_order_items FOR SELECT TO authenticated USING (public.is_internal_user() AND public.has_erp_access(auth.uid()));
CREATE TABLE public.subcontract_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_no text NOT NULL UNIQUE DEFAULT ('WE-FB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 order_id uuid NOT NULL REFERENCES public.subcontract_orders(id), warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), delivery_note_no text,
 received_by uuid NOT NULL DEFAULT auth.uid(), received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subcontract_receipts TO authenticated;
GRANT ALL ON public.subcontract_receipts TO service_role;
ALTER TABLE public.subcontract_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY subcontract_receipts_read ON public.subcontract_receipts FOR SELECT TO authenticated USING (public.is_internal_user() AND public.has_erp_access(auth.uid()));
CREATE TABLE public.subcontract_receipt_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES public.subcontract_receipts(id), item_id uuid NOT NULL REFERENCES public.subcontract_order_items(id),
 quantity numeric NOT NULL CHECK(quantity>0), movement_id uuid NOT NULL REFERENCES public.stock_movements(id)
);
GRANT SELECT ON public.subcontract_receipt_items TO authenticated;
GRANT ALL ON public.subcontract_receipt_items TO service_role;
ALTER TABLE public.subcontract_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY subcontract_receipt_items_read ON public.subcontract_receipt_items FOR SELECT TO authenticated USING (public.is_internal_user() AND public.has_erp_access(auth.uid()));
CREATE FUNCTION public.require_subcontract_writer() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_internal_user() OR NOT public.has_erp_access(auth.uid()) OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN RAISE EXCEPTION 'Keine Berechtigung zur Fremdbearbeitung'; END IF;
END $$;
CREATE FUNCTION public.create_subcontract_order(_supplier_id uuid,_warehouse_id uuid,_items jsonb,_expected_at date DEFAULT NULL,_note text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; it jsonb;
BEGIN
 PERFORM public.require_subcontract_writer();
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=_supplier_id AND is_active) THEN RAISE EXCEPTION 'Aktiven Lieferanten wählen'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Mindestens eine Materialposition erforderlich'; END IF;
 INSERT INTO public.subcontract_orders(supplier_id,warehouse_id,expected_at,note) VALUES(_supplier_id,_warehouse_id,_expected_at,_note) RETURNING id INTO v_id;
 FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
  IF (it->>'quantity') IS NULL OR (it->>'quantity')::numeric<=0 OR (it->>'quantity')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Materialmenge muss positiv und endlich sein'; END IF;
  IF EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=v_id AND art_nr=it->>'art_nr') THEN RAISE EXCEPTION 'Artikel nur einmal je Auftrag erfassen'; END IF;
  INSERT INTO public.subcontract_order_items(order_id,art_nr,description,quantity) SELECT v_id,art_nr,bezeich_1,(it->>'quantity')::numeric FROM public.articles WHERE art_nr=it->>'art_nr';
  IF NOT FOUND THEN RAISE EXCEPTION 'Artikel nicht gefunden'; END IF;
 END LOOP;
 RETURN v_id;
END $$;
CREATE FUNCTION public.issue_subcontract_material(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subcontract_orders; it public.subcontract_order_items; available numeric; reserved numeric;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'draft' THEN RAISE EXCEPTION 'Materialausgabe nur für Entwürfe möglich'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=_id) THEN RAISE EXCEPTION 'Keine Materialpositionen'; END IF;
 FOR it IN SELECT * FROM public.subcontract_order_items WHERE order_id=_id ORDER BY art_nr LOOP
  SELECT quantity INTO available FROM public.inventory_stock WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id FOR UPDATE;
  SELECT coalesce(sum(quantity),0) INTO reserved FROM public.stock_reservations WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id AND status='active' AND (expires_at IS NULL OR expires_at>now());
  IF coalesce(available,0)-reserved<it.quantity THEN RAISE EXCEPTION 'Nicht genügend freier Bestand für %',it.art_nr; END IF;
  INSERT INTO public.stock_movements(art_nr,warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by) VALUES(it.art_nr,o.warehouse_id,'outbound',it.quantity,'subcontract_order',o.id,'Materialausgabe '||o.order_no,auth.uid());
  UPDATE public.subcontract_order_items SET qty_issued=quantity WHERE id=it.id;
 END LOOP;
 UPDATE public.subcontract_orders SET status='issued' WHERE id=_id;
END $$;
CREATE FUNCTION public.receive_subcontract_material(_id uuid,_warehouse_id uuid,_items jsonb,_delivery_note_no text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subcontract_orders; it public.subcontract_order_items; entry jsonb; q numeric; receipt uuid; movement uuid;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 IF o.id IS NULL OR o.status NOT IN ('issued','partial') THEN RAISE EXCEPTION 'Rückbuchung erst nach Materialausgabe möglich'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Rückmenge erfassen'; END IF;
 INSERT INTO public.subcontract_receipts(order_id,warehouse_id,delivery_note_no) VALUES(_id,_warehouse_id,_delivery_note_no) RETURNING id INTO receipt;
 FOR entry IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT * INTO it FROM public.subcontract_order_items WHERE id=(entry->>'item_id')::uuid AND order_id=_id FOR UPDATE;
  q:=(entry->>'quantity')::numeric;
  IF it.id IS NULL OR q IS NULL OR q<=0 OR q::text IN ('NaN','Infinity','-Infinity') OR q>it.qty_issued-it.qty_returned THEN RAISE EXCEPTION 'Rückmenge übersteigt offene Materialmenge oder ist ungültig'; END IF;
  IF EXISTS(SELECT 1 FROM public.subcontract_receipt_items WHERE receipt_id=receipt AND item_id=it.id) THEN RAISE EXCEPTION 'Doppelte Rückposition'; END IF;
  INSERT INTO public.stock_movements(art_nr,warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by) VALUES(it.art_nr,_warehouse_id,'inbound',q,'subcontract_receipt',receipt,'Rückbuchung '||o.order_no,auth.uid()) RETURNING id INTO movement;
  INSERT INTO public.subcontract_receipt_items(receipt_id,item_id,quantity,movement_id) VALUES(receipt,it.id,q,movement);
  UPDATE public.subcontract_order_items SET qty_returned=qty_returned+q WHERE id=it.id;
 END LOOP;
 UPDATE public.subcontract_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=_id AND qty_returned<quantity) THEN 'partial' ELSE 'completed' END WHERE id=_id;
 RETURN receipt;
END $$;
CREATE FUNCTION public.cancel_subcontract_order(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.require_subcontract_writer();
 UPDATE public.subcontract_orders SET status='cancelled' WHERE id=_id AND status='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Nur Entwürfe ohne Materialausgabe können storniert werden'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_subcontract_writer(),public.create_subcontract_order(uuid,uuid,jsonb,date,text),public.issue_subcontract_material(uuid),public.receive_subcontract_material(uuid,uuid,jsonb,text),public.cancel_subcontract_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_subcontract_order(uuid,uuid,jsonb,date,text),public.issue_subcontract_material(uuid),public.receive_subcontract_material(uuid,uuid,jsonb,text),public.cancel_subcontract_order(uuid) TO authenticated;
