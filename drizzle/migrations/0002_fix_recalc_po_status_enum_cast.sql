CREATE OR REPLACE FUNCTION public.recalc_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_po uuid; v_ordered numeric; v_received numeric; v_cur text; v_new text;
BEGIN
  v_po := COALESCE(NEW.po_id, OLD.po_id);
  SELECT COALESCE(SUM(qty_ordered),0), COALESCE(SUM(qty_received),0)
    INTO v_ordered, v_received FROM public.purchase_order_items WHERE po_id = v_po;
  SELECT status::text INTO v_cur FROM public.purchase_orders WHERE id = v_po;
  IF v_cur IS NULL OR v_cur IN ('cancelled','draft') THEN RETURN COALESCE(NEW, OLD); END IF;

  IF v_ordered > 0 AND v_received >= v_ordered THEN v_new := 'received';
  ELSIF v_received > 0 THEN v_new := 'partial';
  ELSE v_new := 'ordered';
  END IF;

  IF v_new IS DISTINCT FROM v_cur THEN
    UPDATE public.purchase_orders SET status = v_new::po_status, updated_at = now() WHERE id = v_po;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;