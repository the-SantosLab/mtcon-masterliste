
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE delta NUMERIC;
BEGIN
  delta := CASE NEW.movement_type
    WHEN 'inbound'    THEN  NEW.quantity
    WHEN 'outbound'   THEN -NEW.quantity
    WHEN 'adjustment' THEN  NEW.quantity
    WHEN 'transfer'   THEN -NEW.quantity
  END;
  INSERT INTO public.inventory_stock (art_nr, warehouse_id, quantity)
  VALUES (NEW.art_nr, NEW.warehouse_id, delta)
  ON CONFLICT (art_nr, warehouse_id)
  DO UPDATE SET quantity = public.inventory_stock.quantity + EXCLUDED.quantity, updated_at = now();
  -- Bei transfer KEINE zusätzliche Buchung auf Ziellager — das übernimmt die
  -- automatisch erzeugte Gegenbuchung (siehe split_transfer_movement()).
  RETURN NEW;
END $function$;
