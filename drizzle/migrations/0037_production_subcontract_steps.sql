ALTER TABLE public.subcontract_orders ADD COLUMN production_order_id uuid REFERENCES public.production_orders(id), ADD COLUMN external_warehouse_id uuid REFERENCES public.warehouses(id);
CREATE INDEX subcontract_production_idx ON public.subcontract_orders(production_order_id);
COMMENT ON COLUMN public.subcontract_orders.production_order_id IS 'Optional linked external processing step before workshop material consumption';

CREATE FUNCTION public.create_production_subcontract_step(_production_order_id uuid,_supplier_id uuid,_items jsonb,_expected_at date DEFAULT NULL,_note text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wo public.production_orders; v_id uuid;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO wo FROM public.production_orders WHERE id=_production_order_id FOR UPDATE;
 IF wo.id IS NULL OR wo.status IN ('completed','cancelled') OR wo.quantity_done>0 OR EXISTS(SELECT 1 FROM public.production_order_items WHERE production_order_id=wo.id AND qty_issued>0) THEN RAISE EXCEPTION 'Fremdbearbeitung vor der internen Materialentnahme anlegen'; END IF;
 v_id:=public.create_subcontract_order(_supplier_id,wo.warehouse_id,_items,_expected_at,_note);
 UPDATE public.subcontract_orders SET production_order_id=wo.id WHERE id=v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_production_subcontract_step(uuid,uuid,jsonb,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_production_subcontract_step(uuid,uuid,jsonb,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_subcontract_material(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subcontract_orders; it public.subcontract_order_items; available numeric; reserved numeric; external_id uuid; wo public.production_orders;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id;
 IF o.production_order_id IS NOT NULL THEN
  SELECT * INTO wo FROM public.production_orders WHERE id=o.production_order_id FOR UPDATE;
  IF wo.status IN ('completed','cancelled') OR wo.quantity_done>0 OR EXISTS(SELECT 1 FROM public.production_order_items WHERE production_order_id=wo.id AND qty_issued>0) THEN RAISE EXCEPTION 'Werkstattauftrag hat bereits Material verbraucht oder ist abgeschlossen'; END IF;
 END IF;
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'draft' THEN RAISE EXCEPTION 'Materialausgabe nur für Entwürfe möglich'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=_id) THEN RAISE EXCEPTION 'Keine Materialpositionen'; END IF;
 IF o.production_order_id IS NOT NULL THEN
  INSERT INTO public.warehouses(code,name) SELECT 'FB-'||o.supplier_id::text,'Fremdbearbeitung · '||name FROM public.suppliers WHERE id=o.supplier_id ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id INTO external_id;
  IF external_id IS NULL OR external_id=o.warehouse_id THEN RAISE EXCEPTION 'Externes Lager muss vom Ausgabelager abweichen'; END IF;
  UPDATE public.subcontract_orders SET external_warehouse_id=external_id WHERE id=_id;
 END IF;
 FOR it IN SELECT * FROM public.subcontract_order_items WHERE order_id=_id ORDER BY art_nr LOOP
  SELECT quantity INTO available FROM public.inventory_stock WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id FOR UPDATE;
  SELECT coalesce(sum(quantity),0) INTO reserved FROM public.stock_reservations WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id AND status='open' AND (expires_at IS NULL OR expires_at>now());
  IF coalesce(available,0)-reserved<it.quantity THEN RAISE EXCEPTION 'Nicht genügend freier Bestand für %',it.art_nr; END IF;
  INSERT INTO public.stock_movements(art_nr,warehouse_id,target_warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by) VALUES(it.art_nr,o.warehouse_id,external_id,CASE WHEN external_id IS NULL THEN 'outbound'::public.stock_movement_type ELSE 'transfer'::public.stock_movement_type END,it.quantity,'subcontract_order',o.id,'Materialausgabe '||o.order_no,auth.uid());
  UPDATE public.subcontract_order_items SET qty_issued=quantity WHERE id=it.id;
 END LOOP;
 UPDATE public.subcontract_orders SET status='issued' WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.receive_subcontract_material(_id uuid,_warehouse_id uuid,_items jsonb,_delivery_note_no text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subcontract_orders; it public.subcontract_order_items; entry jsonb; q numeric; receipt uuid; movement uuid; available numeric;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 IF o.id IS NULL OR o.status NOT IN ('issued','partial') THEN RAISE EXCEPTION 'Rückbuchung erst nach Materialausgabe möglich'; END IF;
 IF o.production_order_id IS NOT NULL AND _warehouse_id IS DISTINCT FROM o.warehouse_id THEN RAISE EXCEPTION 'Werkstattmaterial muss in das Ausgabelager zurückkehren'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Rückmenge erfassen'; END IF;
 INSERT INTO public.subcontract_receipts(order_id,warehouse_id,delivery_note_no) VALUES(_id,_warehouse_id,_delivery_note_no) RETURNING id INTO receipt;
 FOR entry IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT * INTO it FROM public.subcontract_order_items WHERE id=(entry->>'item_id')::uuid AND order_id=_id FOR UPDATE;
  q:=(entry->>'quantity')::numeric;
  IF it.id IS NULL OR q IS NULL OR q<=0 OR q::text IN ('NaN','Infinity','-Infinity') OR q>it.qty_issued-it.qty_returned THEN RAISE EXCEPTION 'Rückmenge übersteigt offene Materialmenge oder ist ungültig'; END IF;
  IF EXISTS(SELECT 1 FROM public.subcontract_receipt_items WHERE receipt_id=receipt AND item_id=it.id) THEN RAISE EXCEPTION 'Doppelte Rückposition'; END IF;
  IF o.external_warehouse_id IS NOT NULL THEN
   SELECT quantity INTO available FROM public.inventory_stock WHERE art_nr=it.art_nr AND warehouse_id=o.external_warehouse_id FOR UPDATE;
   IF coalesce(available,0)<q THEN RAISE EXCEPTION 'Materialbestand beim Bearbeiter reicht nicht aus'; END IF;
  END IF;
  INSERT INTO public.stock_movements(art_nr,warehouse_id,target_warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by) VALUES(it.art_nr,coalesce(o.external_warehouse_id,_warehouse_id),CASE WHEN o.external_warehouse_id IS NULL THEN NULL ELSE _warehouse_id END,CASE WHEN o.external_warehouse_id IS NULL THEN 'inbound'::public.stock_movement_type ELSE 'transfer'::public.stock_movement_type END,q,'subcontract_receipt',receipt,'Rückbuchung '||o.order_no,auth.uid()) RETURNING id INTO movement;
  INSERT INTO public.subcontract_receipt_items(receipt_id,item_id,quantity,movement_id) VALUES(receipt,it.id,q,movement);
  UPDATE public.subcontract_order_items SET qty_returned=qty_returned+q WHERE id=it.id;
 END LOOP;
 UPDATE public.subcontract_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=_id AND qty_returned<quantity) THEN 'partial' ELSE 'completed' END WHERE id=_id;
 RETURN receipt;
END $$;

CREATE FUNCTION public.guard_production_subcontract_step() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.quantity_done IS DISTINCT FROM OLD.quantity_done OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('issued','completed','cancelled'))) AND EXISTS(SELECT 1 FROM public.subcontract_orders WHERE production_order_id=NEW.id AND status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'Fremdbearbeitung zuerst vollständig über den Wareneingang zurücknehmen oder den Entwurf stornieren'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_production_subcontract_step() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_production_subcontract BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.guard_production_subcontract_step();