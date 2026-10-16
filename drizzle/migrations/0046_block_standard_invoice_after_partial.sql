CREATE OR REPLACE FUNCTION public.guard_invoice_after_partial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.doc_kind = 'invoice' AND NEW.invoice_type = 'standard'
     AND EXISTS (SELECT 1 FROM public.invoices WHERE order_id = NEW.order_id AND invoice_type = 'partial' AND doc_kind = 'invoice' AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Für diesen Auftrag gibt es Abschlagsrechnungen – bitte Schlussrechnung erstellen';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_invoice_after_partial BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_after_partial();