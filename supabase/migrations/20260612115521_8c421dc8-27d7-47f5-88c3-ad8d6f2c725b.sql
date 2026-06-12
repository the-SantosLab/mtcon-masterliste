
-- 1) Erweiterungen an stock_movements: direkte Verknüpfungen + Charge/Serie + Transfer-Paar
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS serial_no text;

CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id    ON public.stock_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_project_id  ON public.stock_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_case_id     ON public.stock_movements(case_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer_id ON public.stock_movements(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lot_no      ON public.stock_movements(lot_no) WHERE lot_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_serial_no   ON public.stock_movements(serial_no) WHERE serial_no IS NOT NULL;

-- 2) Trigger: Umlagerung als zwei verknüpfte Bewegungen
--    Beim Insert einer 'transfer'-Zeile wird automatisch die Gegenbuchung (inbound im Ziellager)
--    erzeugt; beide werden über transfer_id gepaart.
CREATE OR REPLACE FUNCTION public.split_transfer_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
BEGIN
  IF NEW.movement_type <> 'transfer' THEN RETURN NEW; END IF;
  IF NEW.target_warehouse_id IS NULL THEN RETURN NEW; END IF;
  -- Schon Teil einer Paarung? (verhindert Rekursion durch die Gegenbuchung)
  IF NEW.transfer_id IS NOT NULL THEN RETURN NEW; END IF;

  v_tid := gen_random_uuid();
  NEW.transfer_id := v_tid;

  -- Gegenbuchung im Ziellager als 'inbound' (gleicher transfer_id)
  INSERT INTO public.stock_movements(
    art_nr, warehouse_id, target_warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, order_id, project_id, case_id,
    lot_no, serial_no, transfer_id, note, created_by
  ) VALUES (
    NEW.art_nr, NEW.target_warehouse_id, NULL, 'inbound', ABS(NEW.quantity), NEW.unit_cost,
    'transfer', v_tid, NEW.order_id, NEW.project_id, NEW.case_id,
    NEW.lot_no, NEW.serial_no, v_tid,
    'Umlagerung (Eingang) · Paar ' || v_tid::text,
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_split_transfer_movement ON public.stock_movements;
CREATE TRIGGER trg_split_transfer_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.split_transfer_movement();

-- 3) Reservierungen
CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','released','consumed')),
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_art_wh ON public.stock_reservations(art_nr, warehouse_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order  ON public.stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_case   ON public.stock_reservations(case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_reservations_select_auth" ON public.stock_reservations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_reservations_insert_auth" ON public.stock_reservations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "stock_reservations_update_auth" ON public.stock_reservations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "stock_reservations_delete_admin" ON public.stock_reservations
  FOR DELETE TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_stock_reservations_touch
BEFORE UPDATE ON public.stock_reservations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) View: verfügbarer Bestand = quantity − offene Reservierungen
CREATE OR REPLACE VIEW public.inventory_available
WITH (security_invoker=on) AS
SELECT
  s.art_nr,
  s.warehouse_id,
  s.quantity AS quantity_on_hand,
  COALESCE((
    SELECT SUM(r.quantity) FROM public.stock_reservations r
    WHERE r.art_nr = s.art_nr AND r.warehouse_id = s.warehouse_id AND r.status = 'open'
  ), 0) AS quantity_reserved,
  s.quantity - COALESCE((
    SELECT SUM(r.quantity) FROM public.stock_reservations r
    WHERE r.art_nr = s.art_nr AND r.warehouse_id = s.warehouse_id AND r.status = 'open'
  ), 0) AS quantity_available
FROM public.inventory_stock s;

GRANT SELECT ON public.inventory_available TO authenticated;
