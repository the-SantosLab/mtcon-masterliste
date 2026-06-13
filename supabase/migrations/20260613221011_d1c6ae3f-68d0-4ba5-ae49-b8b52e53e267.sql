
-- stock_movements: cascade (Bewegungshistorie eines gelöschten Lagers entfernen)
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_warehouse_id_fkey,
  ADD  CONSTRAINT stock_movements_warehouse_id_fkey
       FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_target_warehouse_id_fkey,
  ADD  CONSTRAINT stock_movements_target_warehouse_id_fkey
       FOREIGN KEY (target_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- goods_receipts: Lagerfeld nullable + SET NULL
ALTER TABLE public.goods_receipts ALTER COLUMN warehouse_id DROP NOT NULL;
ALTER TABLE public.goods_receipts
  DROP CONSTRAINT IF EXISTS goods_receipts_warehouse_id_fkey,
  ADD  CONSTRAINT goods_receipts_warehouse_id_fkey
       FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- purchase_orders bereits SET NULL, delivery_items bereits SET NULL – nichts zu tun.
