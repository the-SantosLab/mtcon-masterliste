
-- 1) Bestandsbuchung: jede Lagerbewegung schreibt in inventory_stock
DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 2) Umlagerung: bei type='transfer' automatisch Gegenbuchung erzeugen
DROP TRIGGER IF EXISTS trg_split_transfer_movement ON public.stock_movements;
CREATE TRIGGER trg_split_transfer_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.split_transfer_movement();

-- 3) Wareneingang: erzeugt Bewegung, erhöht qty_received, aktualisiert PO-Status
DROP TRIGGER IF EXISTS trg_process_goods_receipt_item ON public.goods_receipt_items;
CREATE TRIGGER trg_process_goods_receipt_item
BEFORE INSERT ON public.goods_receipt_items
FOR EACH ROW EXECUTE FUNCTION public.process_goods_receipt_item();

-- 4) gr_no automatisch vergeben (Format WE-YYYY-nnnn) falls leer
CREATE OR REPLACE FUNCTION public.assign_gr_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_year text; v_counter int;
BEGIN
  IF NEW.gr_no IS NULL OR NEW.gr_no = '' THEN
    v_year := to_char(now(),'YYYY');
    v_counter := public.next_counter('gr_'||v_year);
    NEW.gr_no := 'WE-'||v_year||'-'||lpad(v_counter::text,4,'0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_gr_no ON public.goods_receipts;
CREATE TRIGGER trg_assign_gr_no
BEFORE INSERT ON public.goods_receipts
FOR EACH ROW EXECUTE FUNCTION public.assign_gr_no();
