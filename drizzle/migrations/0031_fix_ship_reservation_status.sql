CREATE OR REPLACE FUNCTION public.trg_delivery_ship_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it record; v_left numeric; res record;
BEGIN
  IF NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped' THEN
    FOR it IN SELECT * FROM public.delivery_items WHERE delivery_id = NEW.id AND art_nr IS NOT NULL AND warehouse_id IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM public.stock_movements
                     WHERE reference_type = 'delivery' AND reference_id = NEW.id AND art_nr = it.art_nr
                       AND warehouse_id = it.warehouse_id AND movement_type = 'outbound') THEN
        INSERT INTO public.stock_movements(art_nr, warehouse_id, movement_type, quantity, order_id, reference_type, reference_id, note, lot_no, serial_no, created_by)
        VALUES (it.art_nr, it.warehouse_id, 'outbound', it.quantity, NEW.order_id, 'delivery', NEW.id,
                'Lieferschein ' || COALESCE(NEW.delivery_no, ''), it.lot_no, it.serial_no, COALESCE(auth.uid(), NEW.created_by));
      END IF;
      v_left := it.quantity;
      FOR res IN SELECT id, quantity FROM public.stock_reservations
                 WHERE order_id = NEW.order_id AND art_nr = it.art_nr AND status = 'open'
                 ORDER BY created_at LOOP
        EXIT WHEN v_left <= 0;
        IF res.quantity <= v_left THEN
          UPDATE public.stock_reservations SET status = 'consumed', updated_at = now() WHERE id = res.id;
          v_left := v_left - res.quantity;
        ELSE
          UPDATE public.stock_reservations SET quantity = quantity - v_left, updated_at = now() WHERE id = res.id;
          v_left := 0;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'shipped' THEN
    FOR it IN SELECT * FROM public.delivery_items WHERE delivery_id = NEW.id AND art_nr IS NOT NULL AND warehouse_id IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM public.stock_movements
                     WHERE reference_type = 'delivery_cancel' AND reference_id = NEW.id AND art_nr = it.art_nr AND warehouse_id = it.warehouse_id) THEN
        INSERT INTO public.stock_movements(art_nr, warehouse_id, movement_type, quantity, order_id, reference_type, reference_id, note, lot_no, serial_no, created_by)
        VALUES (it.art_nr, it.warehouse_id, 'inbound', it.quantity, NEW.order_id, 'delivery_cancel', NEW.id,
                'Storno Lieferschein ' || COALESCE(NEW.delivery_no, ''), it.lot_no, it.serial_no, COALESCE(auth.uid(), NEW.created_by));
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;