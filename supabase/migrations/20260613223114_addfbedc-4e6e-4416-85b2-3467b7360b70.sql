
-- 1. Add qty_delivered to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty_delivered NUMERIC NOT NULL DEFAULT 0;

-- 2. Auto-assign delivery_no
CREATE OR REPLACE FUNCTION public.assign_delivery_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_no IS NULL OR NEW.delivery_no = '' THEN
    NEW.delivery_no := public.generate_delivery_no();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_delivery_no ON public.deliveries;
CREATE TRIGGER trg_assign_delivery_no
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.assign_delivery_no();

-- 3. On delivery.status -> 'shipped': update qty_delivered + order status
CREATE OR REPLACE FUNCTION public.process_delivery_shipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_total_qty NUMERIC;
  v_total_delivered NUMERIC;
  v_any_delivered NUMERIC;
BEGIN
  IF NEW.status <> 'shipped' OR OLD.status = 'shipped' THEN
    RETURN NEW;
  END IF;

  -- bump qty_delivered for each linked order_item
  UPDATE public.order_items oi
  SET qty_delivered = COALESCE(oi.qty_delivered, 0) + di.quantity
  FROM public.delivery_items di
  WHERE di.delivery_id = NEW.id
    AND di.order_item_id = oi.id;

  v_order_id := NEW.order_id;
  IF v_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(qty_delivered),0),
         COALESCE(SUM(CASE WHEN qty_delivered > 0 THEN 1 ELSE 0 END),0)
    INTO v_total_qty, v_total_delivered, v_any_delivered
  FROM public.order_items WHERE order_id = v_order_id;

  IF v_total_qty > 0 AND v_total_delivered >= v_total_qty THEN
    UPDATE public.orders SET status = 'delivered', updated_at = now() WHERE id = v_order_id;
  ELSIF v_any_delivered > 0 THEN
    UPDATE public.orders SET status = 'partially_delivered', updated_at = now() WHERE id = v_order_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_process_delivery_shipped ON public.deliveries;
CREATE TRIGGER trg_process_delivery_shipped
  AFTER UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.process_delivery_shipped();
