
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_read_all_auth" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouses_admin_write" ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr TEXT NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (art_nr, warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock TO authenticated;
GRANT ALL ON public.inventory_stock TO service_role;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_stock_read_all_auth" ON public.inventory_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_stock_staff_write" ON public.inventory_stock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE INDEX idx_inventory_stock_art_nr ON public.inventory_stock(art_nr);
CREATE INDEX idx_inventory_stock_warehouse ON public.inventory_stock(warehouse_id);

CREATE TYPE public.stock_movement_type AS ENUM ('inbound', 'outbound', 'adjustment', 'transfer');

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr TEXT NOT NULL REFERENCES public.articles(art_nr) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  target_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  movement_type public.stock_movement_type NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,4),
  reference_type TEXT,
  reference_id UUID,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_read_all_auth" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_movements_staff_insert" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "stock_movements_admin_modify" ON public.stock_movements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stock_movements_admin_delete" ON public.stock_movements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_stock_movements_art_nr ON public.stock_movements(art_nr);
CREATE INDEX idx_stock_movements_warehouse ON public.stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_inv()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_inv();
CREATE TRIGGER trg_inventory_stock_updated BEFORE UPDATE ON public.inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_inv();

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NEW.movement_type = 'transfer' AND NEW.target_warehouse_id IS NOT NULL THEN
    INSERT INTO public.inventory_stock (art_nr, warehouse_id, quantity)
    VALUES (NEW.art_nr, NEW.target_warehouse_id, NEW.quantity)
    ON CONFLICT (art_nr, warehouse_id)
    DO UPDATE SET quantity = public.inventory_stock.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_stock_movement AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

INSERT INTO public.warehouses (code, name, is_default) VALUES ('HQ', 'Hauptlager', true)
ON CONFLICT (code) DO NOTHING;
