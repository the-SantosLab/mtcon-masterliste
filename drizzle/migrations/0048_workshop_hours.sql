ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS planned_hours numeric, ADD COLUMN IF NOT EXISTS actual_hours numeric;
COMMENT ON COLUMN public.production_orders.planned_hours IS 'Geplante Arbeitsstunden für Auslastung und Nachkalkulation';
COMMENT ON COLUMN public.production_orders.actual_hours IS 'Tatsächliche Arbeitsstunden für Nachkalkulation';