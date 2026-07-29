
-- Block 1: Rechtssicher fakturieren

-- 1) Invoices erweitern
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS skonto_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS skonto_days integer,
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS storno_of_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_note_of_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doc_kind text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check
  CHECK (payment_status IN ('open','partial','paid','overdue','cancelled'));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_tax_mode_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tax_mode_check
  CHECK (tax_mode IN ('standard','reverse_charge','tax_free_eu','tax_free_third_country','small_business'));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_doc_kind_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_doc_kind_check
  CHECK (doc_kind IN ('invoice','credit_note','storno'));

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_storno_of ON public.invoices(storno_of_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_credit_of ON public.invoices(credit_note_of_invoice_id);

-- 2) Zahlungen
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_payments read" ON public.invoice_payments;
CREATE POLICY "invoice_payments read" ON public.invoice_payments FOR SELECT
  TO authenticated USING (public.has_erp_access(auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "invoice_payments insert" ON public.invoice_payments;
CREATE POLICY "invoice_payments insert" ON public.invoice_payments FOR INSERT
  TO authenticated WITH CHECK (public.has_erp_access(auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "invoice_payments update" ON public.invoice_payments;
CREATE POLICY "invoice_payments update" ON public.invoice_payments FOR UPDATE
  TO authenticated USING (public.has_erp_access(auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "invoice_payments delete" ON public.invoice_payments;
CREATE POLICY "invoice_payments delete" ON public.invoice_payments FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);

-- 3) Automatik: Fälligkeit aus Zahlungsziel setzen
CREATE OR REPLACE FUNCTION public.invoice_apply_due_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.invoice_date IS NOT NULL THEN
    NEW.due_date := NEW.invoice_date + COALESCE(NEW.payment_terms_days, 14);
  END IF;
  IF NEW.doc_kind IN ('credit_note','storno') THEN
    NEW.payment_status := 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_apply_due_date ON public.invoices;
CREATE TRIGGER trg_invoice_apply_due_date
  BEFORE INSERT OR UPDATE OF invoice_date, payment_terms_days, doc_kind ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_apply_due_date();

-- 4) Automatik: Zahlungen neu berechnen
CREATE OR REPLACE FUNCTION public.invoice_recalc_payments(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sum numeric(14,2);
  v_last timestamptz;
  v_total numeric(14,2);
  v_due date;
  v_kind text;
  v_new_status text;
BEGIN
  SELECT COALESCE(SUM(amount),0), MAX(paid_on)::timestamptz
    INTO v_sum, v_last
    FROM public.invoice_payments WHERE invoice_id = p_invoice_id;

  SELECT total_amount, due_date, doc_kind INTO v_total, v_due, v_kind
    FROM public.invoices WHERE id = p_invoice_id;

  IF v_kind IN ('credit_note','storno') THEN
    v_new_status := 'cancelled';
  ELSIF v_total IS NULL OR v_total = 0 THEN
    v_new_status := 'open';
  ELSIF v_sum >= v_total THEN
    v_new_status := 'paid';
  ELSIF v_sum > 0 THEN
    v_new_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'open';
  END IF;

  UPDATE public.invoices
     SET paid_amount = v_sum,
         paid_at = CASE WHEN v_new_status = 'paid' THEN v_last ELSE NULL END,
         payment_status = v_new_status,
         updated_at = now()
   WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payments_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.invoice_recalc_payments(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_after_change ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.invoice_payments_after_change();

-- 5) Nightly: überfällige markieren
CREATE OR REPLACE FUNCTION public.mark_invoices_overdue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.invoices
     SET payment_status = 'overdue', updated_at = now()
   WHERE doc_kind = 'invoice'
     AND payment_status IN ('open','partial')
     AND due_date IS NOT NULL
     AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6) Backfill: bestehende Rechnungen einordnen
UPDATE public.invoices
   SET payment_status = CASE
     WHEN doc_kind IN ('credit_note','storno') THEN 'cancelled'
     WHEN status = 'cancelled' THEN 'cancelled'
     WHEN status = 'paid' THEN 'paid'
     WHEN total_amount IS NOT NULL AND paid_amount >= total_amount AND total_amount > 0 THEN 'paid'
     WHEN paid_amount > 0 THEN 'partial'
     WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue'
     ELSE 'open'
   END
 WHERE payment_status = 'open';
