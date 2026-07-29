-- 1) qty_invoiced on order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty_invoiced numeric NOT NULL DEFAULT 0;

-- 1a) Relax orders_status_check to allow partial/delivered/invoiced states
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'draft','active','in_progress','confirmed',
    'partially_delivered','delivered',
    'partially_invoiced','invoiced',
    'completed','cancelled'
  ]));

-- 2) Recalc function: recomputes qty_delivered / qty_invoiced for a given order_item
CREATE OR REPLACE FUNCTION public.recalc_order_item_progress(_order_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_delivered numeric := 0;
  v_invoiced  numeric := 0;
BEGIN
  IF _order_item_id IS NULL THEN RETURN; END IF;

  SELECT order_id INTO v_order_id FROM public.order_items WHERE id = _order_item_id;
  IF v_order_id IS NULL THEN RETURN; END IF;

  -- delivered = sum of delivery_items on non-cancelled deliveries
  SELECT COALESCE(SUM(di.quantity), 0) INTO v_delivered
  FROM public.delivery_items di
  JOIN public.deliveries d ON d.id = di.delivery_id
  WHERE di.order_item_id = _order_item_id
    AND COALESCE(d.status, 'draft') <> 'cancelled';

  -- invoiced = invoice_items on invoices minus stornos of those invoices
  SELECT COALESCE(SUM(
    CASE WHEN COALESCE(inv.doc_kind, 'invoice') = 'storno' THEN -ii.quantity ELSE ii.quantity END
  ), 0) INTO v_invoiced
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  WHERE ii.order_item_id = _order_item_id
    AND COALESCE(inv.status, 'draft') <> 'cancelled';

  UPDATE public.order_items
     SET qty_delivered = GREATEST(0, v_delivered),
         qty_invoiced  = GREATEST(0, v_invoiced)
   WHERE id = _order_item_id;

  PERFORM public.recalc_order_status(v_order_id);
END;
$$;

-- 3) Recalc order status from position aggregates
CREATE OR REPLACE FUNCTION public.recalc_order_status(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     numeric := 0;
  v_delivered numeric := 0;
  v_invoiced  numeric := 0;
  v_current   text;
  v_new       text;
BEGIN
  IF _order_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(quantity), 0),
         COALESCE(SUM(qty_delivered), 0),
         COALESCE(SUM(qty_invoiced), 0)
    INTO v_total, v_delivered, v_invoiced
    FROM public.order_items
   WHERE order_id = _order_id;

  SELECT status INTO v_current FROM public.orders WHERE id = _order_id;

  -- Don't override manual states
  IF v_current IN ('cancelled', 'draft') THEN RETURN; END IF;

  IF v_total <= 0 THEN RETURN; END IF;

  IF v_invoiced >= v_total THEN
    v_new := 'invoiced';
  ELSIF v_invoiced > 0 THEN
    v_new := 'partially_invoiced';
  ELSIF v_delivered >= v_total THEN
    v_new := 'delivered';
  ELSIF v_delivered > 0 THEN
    v_new := 'partially_delivered';
  ELSE
    v_new := COALESCE(v_current, 'confirmed');
  END IF;

  IF v_new IS DISTINCT FROM v_current THEN
    UPDATE public.orders SET status = v_new, updated_at = now() WHERE id = _order_id;
  END IF;
END;
$$;

-- 4) Trigger on delivery_items
CREATE OR REPLACE FUNCTION public.trg_delivery_items_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_order_item_progress(OLD.order_item_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.order_item_id IS DISTINCT FROM NEW.order_item_id THEN
    PERFORM public.recalc_order_item_progress(OLD.order_item_id);
  END IF;
  PERFORM public.recalc_order_item_progress(NEW.order_item_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_items_progress ON public.delivery_items;
CREATE TRIGGER trg_delivery_items_progress
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_items
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_items_progress();

-- 5) Trigger on invoice_items
CREATE OR REPLACE FUNCTION public.trg_invoice_items_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.order_item_id IS NOT NULL THEN PERFORM public.recalc_order_item_progress(OLD.order_item_id); END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.order_item_id IS DISTINCT FROM NEW.order_item_id THEN
    IF OLD.order_item_id IS NOT NULL THEN PERFORM public.recalc_order_item_progress(OLD.order_item_id); END IF;
  END IF;
  IF NEW.order_item_id IS NOT NULL THEN PERFORM public.recalc_order_item_progress(NEW.order_item_id); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_progress ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_progress
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_items_progress();

-- 6) When a delivery / invoice status flips to cancelled or back, recalc all its positions
CREATE OR REPLACE FUNCTION public.trg_delivery_status_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  FOR r IN SELECT DISTINCT order_item_id FROM public.delivery_items WHERE delivery_id = NEW.id AND order_item_id IS NOT NULL LOOP
    PERFORM public.recalc_order_item_progress(r.order_item_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_status_progress ON public.deliveries;
CREATE TRIGGER trg_delivery_status_progress
AFTER UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_status_progress();

CREATE OR REPLACE FUNCTION public.trg_invoice_status_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.doc_kind IS NOT DISTINCT FROM NEW.doc_kind THEN RETURN NEW; END IF;
  FOR r IN SELECT DISTINCT order_item_id FROM public.invoice_items WHERE invoice_id = NEW.id AND order_item_id IS NOT NULL LOOP
    PERFORM public.recalc_order_item_progress(r.order_item_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_status_progress ON public.invoices;
CREATE TRIGGER trg_invoice_status_progress
AFTER UPDATE OF status, doc_kind ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_status_progress();

-- 7) Backfill: recompute for all existing order_items
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.order_items LOOP
    PERFORM public.recalc_order_item_progress(r.id);
  END LOOP;
END $$;