ALTER TABLE public.goods_inspections
  ADD CONSTRAINT goods_inspections_warehouse_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id),
  ADD CONSTRAINT goods_inspections_case_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;