ALTER TABLE public.subcontract_receipts ADD COLUMN request_id uuid UNIQUE;
CREATE OR REPLACE FUNCTION public.issue_subcontract_material(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.subcontract_orders; it public.subcontract_order_items; available numeric; reserved numeric;
BEGIN
 PERFORM public.require_subcontract_writer();
 SELECT * INTO o FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'draft' THEN RAISE EXCEPTION 'Materialausgabe nur für Entwürfe möglich'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subcontract_order_items WHERE order_id=_id) THEN RAISE EXCEPTION 'Keine Materialpositionen'; END IF;
 FOR it IN SELECT * FROM public.subcontract_order_items WHERE order_id=_id ORDER BY art_nr LOOP
  SELECT quantity INTO available FROM public.inventory_stock WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id FOR UPDATE;
  SELECT coalesce(sum(quantity),0) INTO reserved FROM public.stock_reservations WHERE art_nr=it.art_nr AND warehouse_id=o.warehouse_id AND status='open' AND (expires_at IS NULL OR expires_at>now());
  IF coalesce(available,0)-reserved<it.quantity THEN RAISE EXCEPTION 'Nicht genügend freier Bestand für %',it.art_nr; END IF;
  INSERT INTO public.stock_movements(art_nr,warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by) VALUES(it.art_nr,o.warehouse_id,'outbound',it.quantity,'subcontract_order',o.id,'Materialausgabe '||o.order_no,auth.uid());
  UPDATE public.subcontract_order_items SET qty_issued=quantity WHERE id=it.id;
 END LOOP;
 UPDATE public.subcontract_orders SET status='issued' WHERE id=_id;
END $$;
CREATE FUNCTION public.book_subcontract_receipt(_id uuid,_warehouse_id uuid,_items jsonb,_request_id uuid,_delivery_note_no text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; receipt uuid;
BEGIN
 PERFORM public.require_subcontract_writer();
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Buchungsschlüssel fehlt'; END IF;
 PERFORM 1 FROM public.subcontract_orders WHERE id=_id FOR UPDATE;
 SELECT id INTO existing FROM public.subcontract_receipts WHERE request_id=_request_id AND order_id=_id;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 receipt:=public.receive_subcontract_material(_id,_warehouse_id,_items,_delivery_note_no);
 UPDATE public.subcontract_receipts SET request_id=_request_id WHERE id=receipt;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.book_subcontract_receipt(uuid,uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.book_subcontract_receipt(uuid,uuid,jsonb,uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_subcontract_material(uuid,uuid,jsonb,text) FROM authenticated;
