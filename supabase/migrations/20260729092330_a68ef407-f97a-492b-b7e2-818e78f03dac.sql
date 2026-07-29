
-- Reminder log
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  stage SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 3),
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  sent_to TEXT,
  note TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON public.invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_at ON public.invoice_reminders(sent_at DESC);

GRANT SELECT, INSERT ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_read_reminders" ON public.invoice_reminders
  FOR SELECT TO authenticated USING (public.has_erp_access(auth.uid()));
CREATE POLICY "erp_insert_reminders" ON public.invoice_reminders
  FOR INSERT TO authenticated WITH CHECK (public.has_erp_access(auth.uid()));

-- Invoice rollup fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminder_stage SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dunning_fee_total NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Settings (single row)
CREATE TABLE IF NOT EXISTS public.dunning_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled BOOLEAN NOT NULL DEFAULT false,
  stage1_days INT NOT NULL DEFAULT 7,
  stage2_days INT NOT NULL DEFAULT 14,
  stage3_days INT NOT NULL DEFAULT 14,
  stage1_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  stage2_fee NUMERIC(10,2) NOT NULL DEFAULT 5,
  stage3_fee NUMERIC(10,2) NOT NULL DEFAULT 10,
  sender_name TEXT NOT NULL DEFAULT 'MTCON Buchhaltung',
  sender_email TEXT NOT NULL DEFAULT 'noreply@kscommand.com',
  bcc_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.dunning_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.dunning_settings TO authenticated;
GRANT ALL ON public.dunning_settings TO service_role;
ALTER TABLE public.dunning_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_read_dunning_settings" ON public.dunning_settings
  FOR SELECT TO authenticated USING (public.has_erp_access(auth.uid()));
CREATE POLICY "admin_write_dunning_settings" ON public.dunning_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Trigger to keep rollup fields in sync on new reminders
CREATE OR REPLACE FUNCTION public.after_invoice_reminder_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.invoices
     SET reminder_stage = GREATEST(reminder_stage, NEW.stage),
         last_reminder_at = NEW.sent_at,
         dunning_fee_total = dunning_fee_total + COALESCE(NEW.fee,0)
   WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_after_invoice_reminder_insert ON public.invoice_reminders;
CREATE TRIGGER trg_after_invoice_reminder_insert
  AFTER INSERT ON public.invoice_reminders
  FOR EACH ROW EXECUTE FUNCTION public.after_invoice_reminder_insert();
