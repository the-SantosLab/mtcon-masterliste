
-- =====================================================================
-- Intelligent Inbox Framework (Step 3)
-- =====================================================================

-- Sequence for INB numbers
CREATE SEQUENCE IF NOT EXISTS public.inbox_no_seq START 1;

-- ---------------------------------------------------------------------
-- document_types
-- ---------------------------------------------------------------------
CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_de text NOT NULL,
  description text,
  icon text DEFAULT 'FileText',
  color text DEFAULT '#64748b',
  extraction_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  classification_hints text,
  target_table text,
  auto_apply_threshold numeric(3,2) DEFAULT 0.85,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_types read for authenticated"
  ON public.document_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "doc_types admin write"
  ON public.document_types FOR INSERT
  TO authenticated WITH CHECK (public.check_is_admin(auth.uid()));

CREATE POLICY "doc_types admin update"
  ON public.document_types FOR UPDATE
  TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE POLICY "doc_types admin delete"
  ON public.document_types FOR DELETE
  TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_document_types_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- inbox_documents
-- ---------------------------------------------------------------------
CREATE TABLE public.inbox_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_no text UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  from_email text,
  from_name text,
  subject text,
  raw_email_id text,
  storage_path text,
  filename text,
  classified_type_id uuid REFERENCES public.document_types(id) ON DELETE SET NULL,
  classification_confidence numeric(3,2),
  classification_reasoning text,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'needs_triage'
    CHECK (status IN ('needs_triage','auto_classified','confirmed','linked','dismissed','failed')),
  linked_table text,
  linked_id uuid,
  error_message text,
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_documents_status ON public.inbox_documents(status);
CREATE INDEX idx_inbox_documents_type ON public.inbox_documents(classified_type_id);
CREATE INDEX idx_inbox_documents_received ON public.inbox_documents(received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_documents TO authenticated;
GRANT ALL ON public.inbox_documents TO service_role;

ALTER TABLE public.inbox_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_docs read authenticated"
  ON public.inbox_documents FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "inbox_docs admin/staff write"
  ON public.inbox_documents FOR INSERT
  TO authenticated WITH CHECK (
    public.check_is_admin(auth.uid()) OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "inbox_docs admin/staff update"
  ON public.inbox_documents FOR UPDATE
  TO authenticated USING (
    public.check_is_admin(auth.uid()) OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "inbox_docs admin delete"
  ON public.inbox_documents FOR DELETE
  TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_inbox_documents_updated_at
  BEFORE UPDATE ON public.inbox_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign INB-YYYY-nnnn
CREATE OR REPLACE FUNCTION public.assign_inbox_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_counter integer;
BEGIN
  IF NEW.inbox_no IS NULL THEN
    v_year := to_char(now(), 'YYYY');
    v_counter := public.next_counter('inbox_' || v_year);
    NEW.inbox_no := 'INB-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inbox_documents_assign_no
  BEFORE INSERT ON public.inbox_documents
  FOR EACH ROW EXECUTE FUNCTION public.assign_inbox_no();

-- ---------------------------------------------------------------------
-- inbox_corrections
-- ---------------------------------------------------------------------
CREATE TABLE public.inbox_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_document_id uuid NOT NULL REFERENCES public.inbox_documents(id) ON DELETE CASCADE,
  document_type_id uuid REFERENCES public.document_types(id) ON DELETE SET NULL,
  field_path text NOT NULL,
  ai_value jsonb,
  user_value jsonb,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_corrections_type ON public.inbox_corrections(document_type_id);
CREATE INDEX idx_inbox_corrections_doc ON public.inbox_corrections(inbox_document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_corrections TO authenticated;
GRANT ALL ON public.inbox_corrections TO service_role;

ALTER TABLE public.inbox_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections read authenticated"
  ON public.inbox_corrections FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "corrections insert authenticated"
  ON public.inbox_corrections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "corrections admin delete"
  ON public.inbox_corrections FOR DELETE
  TO authenticated USING (public.check_is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- action_rules
-- ---------------------------------------------------------------------
CREATE TABLE public.action_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  document_type_id uuid REFERENCES public.document_types(id) ON DELETE CASCADE,
  trigger text NOT NULL
    CHECK (trigger IN ('on_classify','on_confirm','on_field_match','on_schedule')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_rules_type ON public.action_rules(document_type_id);
CREATE INDEX idx_action_rules_trigger ON public.action_rules(trigger) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_rules TO authenticated;
GRANT ALL ON public.action_rules TO service_role;

ALTER TABLE public.action_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules read authenticated"
  ON public.action_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rules admin write"
  ON public.action_rules FOR INSERT
  TO authenticated WITH CHECK (public.check_is_admin(auth.uid()));

CREATE POLICY "rules admin update"
  ON public.action_rules FOR UPDATE
  TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE POLICY "rules admin delete"
  ON public.action_rules FOR DELETE
  TO authenticated USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_action_rules_updated_at
  BEFORE UPDATE ON public.action_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- action_executions
-- ---------------------------------------------------------------------
CREATE TABLE public.action_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.action_rules(id) ON DELETE SET NULL,
  inbox_document_id uuid REFERENCES public.inbox_documents(id) ON DELETE CASCADE,
  action_type text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK (result IN ('success','failed','skipped')),
  error_message text,
  payload jsonb
);

CREATE INDEX idx_action_exec_doc ON public.action_executions(inbox_document_id);
CREATE INDEX idx_action_exec_rule ON public.action_executions(rule_id);

GRANT SELECT, INSERT ON public.action_executions TO authenticated;
GRANT ALL ON public.action_executions TO service_role;

ALTER TABLE public.action_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exec read authenticated"
  ON public.action_executions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "exec service insert"
  ON public.action_executions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('inbox-documents', 'inbox-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "inbox-docs read authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inbox-documents');

CREATE POLICY "inbox-docs insert authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'inbox-documents');

CREATE POLICY "inbox-docs update admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'inbox-documents' AND public.check_is_admin(auth.uid()));

CREATE POLICY "inbox-docs delete admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'inbox-documents' AND public.check_is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- Seed default document types
-- ---------------------------------------------------------------------
INSERT INTO public.document_types (code, label_de, description, icon, color, classification_hints, target_table, extraction_schema, sort_order) VALUES
('insurance', 'Versicherung', 'Versicherungspolicen, Vertragsdokumente, Verlängerungen', 'Shield', '#3b82f6',
  'Versicherungsschein, Police, Versicherungsnummer, Beitrag, Laufzeit, Allianz, AXA, HDI, Zurich, R+V, Gerling, Versicherer',
  'insurance_policies',
  '[
    {"key":"name","label":"Bezeichnung","type":"text","required":true,"description":"Kurzbezeichnung der Versicherung"},
    {"key":"provider","label":"Versicherer","type":"text","required":true,"description":"Name der Versicherungsgesellschaft"},
    {"key":"policy_number","label":"Policennummer","type":"text","required":true,"description":"Versicherungsschein-/Policennummer"},
    {"key":"insured_object","label":"Versichertes Objekt","type":"text","required":false},
    {"key":"start_date","label":"Beginn","type":"date","required":false,"description":"Versicherungsbeginn YYYY-MM-DD"},
    {"key":"end_date","label":"Ende","type":"date","required":false,"description":"Versicherungsende YYYY-MM-DD"},
    {"key":"renewal_date","label":"Verlängerung","type":"date","required":false},
    {"key":"notice_period_days","label":"Kündigungsfrist (Tage)","type":"number","required":false},
    {"key":"premium_amount","label":"Beitrag","type":"number","required":false},
    {"key":"currency","label":"Währung","type":"text","required":false},
    {"key":"description","label":"Beschreibung","type":"text","required":false}
  ]'::jsonb, 10),
('order', 'Bestellung', 'Eingehende Bestellungen, Aufträge, Auftragsbestätigungen', 'Package', '#a855f7',
  'Bestellung, Auftrag, Order, Auftragsbestätigung, Bestellnummer, Liefertermin, Position, Artikel, Menge',
  'orders',
  '[
    {"key":"customer_name","label":"Kunde","type":"text","required":true},
    {"key":"customer_email","label":"Kunden-E-Mail","type":"text","required":false},
    {"key":"customer_number","label":"Kundennummer","type":"text","required":false},
    {"key":"order_reference","label":"Bestellreferenz","type":"text","required":false,"description":"Kundenseitige Bestellnummer"},
    {"key":"delivery_date","label":"Liefertermin","type":"date","required":false},
    {"key":"currency","label":"Währung","type":"text","required":false},
    {"key":"total_amount","label":"Gesamtbetrag","type":"number","required":false},
    {"key":"items","label":"Positionen","type":"array","required":false,"description":"Liste der bestellten Positionen mit sku, description, quantity, unit_price"},
    {"key":"notes","label":"Notizen","type":"text","required":false}
  ]'::jsonb, 20),
('invoice', 'Rechnung', 'Eingangsrechnungen, Mahnungen', 'Receipt', '#f59e0b',
  'Rechnung, Invoice, Rechnungsnummer, Betrag, USt, MwSt, Zahlungsziel, IBAN',
  NULL,
  '[
    {"key":"invoice_number","label":"Rechnungsnummer","type":"text","required":true},
    {"key":"vendor","label":"Lieferant","type":"text","required":true},
    {"key":"invoice_date","label":"Rechnungsdatum","type":"date","required":false},
    {"key":"due_date","label":"Fällig am","type":"date","required":false},
    {"key":"net_amount","label":"Netto","type":"number","required":false},
    {"key":"tax_amount","label":"USt-Betrag","type":"number","required":false},
    {"key":"total_amount","label":"Gesamt","type":"number","required":false},
    {"key":"currency","label":"Währung","type":"text","required":false},
    {"key":"iban","label":"IBAN","type":"text","required":false}
  ]'::jsonb, 30),
('delivery_note', 'Lieferschein', 'Lieferpapiere, Wareneingang', 'Truck', '#10b981',
  'Lieferschein, Lieferung, Wareneingang, Packliste, Frachtbrief, Sendungsnummer, Versandbeleg',
  NULL,
  '[
    {"key":"delivery_number","label":"Lieferscheinnummer","type":"text","required":true},
    {"key":"sender","label":"Absender","type":"text","required":false},
    {"key":"recipient","label":"Empfänger","type":"text","required":false},
    {"key":"delivery_date","label":"Lieferdatum","type":"date","required":false},
    {"key":"tracking_number","label":"Sendungsnummer","type":"text","required":false},
    {"key":"items","label":"Positionen","type":"array","required":false}
  ]'::jsonb, 40),
('contract', 'Vertrag', 'Verträge, Vereinbarungen, NDAs', 'FileSignature', '#ec4899',
  'Vertrag, Vereinbarung, Contract, NDA, Geheimhaltung, Rahmenvertrag, AGB, Laufzeit, Kündigungsfrist',
  NULL,
  '[
    {"key":"title","label":"Titel","type":"text","required":true},
    {"key":"counterparty","label":"Vertragspartner","type":"text","required":true},
    {"key":"contract_type","label":"Vertragsart","type":"text","required":false},
    {"key":"start_date","label":"Beginn","type":"date","required":false},
    {"key":"end_date","label":"Ende","type":"date","required":false},
    {"key":"notice_period_days","label":"Kündigungsfrist (Tage)","type":"number","required":false},
    {"key":"value","label":"Vertragsvolumen","type":"number","required":false},
    {"key":"currency","label":"Währung","type":"text","required":false}
  ]'::jsonb, 50),
('other', 'Sonstiges', 'Nicht eindeutig zuordenbare Dokumente', 'File', '#64748b',
  '',
  NULL,
  '[
    {"key":"summary","label":"Zusammenfassung","type":"text","required":false,"description":"Kurze Zusammenfassung des Dokumentinhalts"},
    {"key":"key_dates","label":"Wichtige Daten","type":"array","required":false},
    {"key":"key_parties","label":"Beteiligte","type":"array","required":false}
  ]'::jsonb, 999);
