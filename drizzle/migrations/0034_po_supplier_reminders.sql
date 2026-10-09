ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS status_query_mailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_delay_mailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_clarification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clarification_reason text;

CREATE TABLE public.purchase_order_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN ('status_query','delivery_delay')),
  trigger_date date,
  recipient_email text,
  recipient_name text,
  subject text,
  body text,
  status text NOT NULL CHECK (status IN ('sent','failed','no_recipient')),
  error text,
  manual boolean NOT NULL DEFAULT false,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_po_email_auto ON public.purchase_order_email_logs(po_id, email_type, trigger_date)
  WHERE status = 'sent' AND manual = false;
CREATE INDEX idx_po_email_logs_po ON public.purchase_order_email_logs(po_id, sent_at DESC);
GRANT SELECT ON public.purchase_order_email_logs TO authenticated;
GRANT ALL ON public.purchase_order_email_logs TO service_role;
ALTER TABLE public.purchase_order_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_email_logs_read ON public.purchase_order_email_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

CREATE TABLE public.purchase_email_templates (
  email_type text PRIMARY KEY CHECK (email_type IN ('status_query','delivery_delay')),
  subject text NOT NULL,
  body text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.purchase_email_templates TO authenticated;
GRANT ALL ON public.purchase_email_templates TO service_role;
ALTER TABLE public.purchase_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_tpl_read ON public.purchase_email_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY po_tpl_write ON public.purchase_email_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY po_tpl_insert ON public.purchase_email_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.purchase_email_templates (email_type, subject, body) VALUES
('status_query', 'Statusabfrage Bestellung {{po_no}} – Liefertermin {{delivery_date}}',
'Sehr geehrte/r {{contact_name}},

zu unserer Bestellung {{po_no}} haben Sie uns den Liefertermin {{delivery_date}} bestätigt.

Bestellte Artikel:
{{items}}

Bitte teilen Sie uns kurz mit, ob dieser Termin weiterhin eingehalten wird oder ob mit Verzögerungen zu rechnen ist.

Mit freundlichen Grüßen
Einkauf MTCON'),
('delivery_delay', 'Lieferverzug Bestellung {{po_no}} – Termin {{delivery_date}} überschritten',
'Sehr geehrte/r {{contact_name}},

der bestätigte Liefertermin {{delivery_date}} für unsere Bestellung {{po_no}} ist überschritten. Folgende Positionen sind noch offen:
{{items}}

Bitte teilen Sie uns umgehend den aktuellen Lieferstatus sowie einen neuen verbindlichen Liefertermin mit.

Mit freundlichen Grüßen
Einkauf MTCON')
ON CONFLICT (email_type) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_net;