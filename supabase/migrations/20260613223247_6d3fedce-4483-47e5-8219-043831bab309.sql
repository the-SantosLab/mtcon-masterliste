
-- Auto-assign invoice_no
CREATE OR REPLACE FUNCTION public.assign_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    NEW.invoice_no := public.generate_invoice_no();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_invoice_no ON public.invoices;
CREATE TRIGGER trg_assign_invoice_no
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_no();

-- Prevent duplicate invoices per delivery
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_delivery_id
  ON public.invoices(delivery_id)
  WHERE delivery_id IS NOT NULL;
