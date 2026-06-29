
-- Erweiterungen cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS process_shape text CHECK (process_shape IN ('point','line','triangle','square')),
  ADD COLUMN IF NOT EXISTS process_template_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Erweiterungen mtiq_drafts
ALTER TABLE public.mtiq_drafts
  ADD COLUMN IF NOT EXISTS process_shape text CHECK (process_shape IN ('point','line','triangle','square')),
  ADD COLUMN IF NOT EXISTS customer_kind text CHECK (customer_kind IN ('neukunde','bestandskunde','interessent','kunde')),
  ADD COLUMN IF NOT EXISTS suggested_company_id uuid;

-- Prozess-Templates
CREATE TABLE IF NOT EXISTS public.process_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shape text NOT NULL CHECK (shape IN ('point','line','triangle','square')),
  name text NOT NULL,
  description text,
  departments text[] NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.process_templates TO authenticated;
GRANT ALL ON public.process_templates TO service_role;

ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read process templates" ON public.process_templates;
CREATE POLICY "Authenticated read process templates" ON public.process_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage process templates" ON public.process_templates;
CREATE POLICY "Admins manage process templates" ON public.process_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_process_templates_updated_at ON public.process_templates;
CREATE TRIGGER update_process_templates_updated_at
  BEFORE UPDATE ON public.process_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default-Seeds
INSERT INTO public.process_templates (shape, name, description, departments, steps) VALUES
('point', 'Standard-Anfrage Vertrieb', 'Schnelle Bearbeitung in einer Abteilung',
 ARRAY['Vertrieb'],
 '[{"order":1,"department":"Vertrieb","title":"Anfrage prüfen & beantworten","required_outputs":["Antwort an Kunde"]}]'::jsonb),
('line', 'Bestand-Bestellung Linie', 'Sequenzieller Ablauf für Bestandsware',
 ARRAY['Vertrieb','Lager','Versand'],
 '[
   {"order":1,"department":"Vertrieb","title":"Auftrag erfassen","required_outputs":["Auftragsbestätigung"]},
   {"order":2,"department":"Lager","title":"Kommissionieren","required_outputs":["Lieferschein"]},
   {"order":3,"department":"Versand","title":"Versenden","required_outputs":["Sendungsverfolgung"]}
 ]'::jsonb),
('triangle', 'Bestandsprodukt Verkauf', 'Vertrieb/Einkauf/Produktion',
 ARRAY['Vertrieb','Einkauf','Produktion'],
 '[
   {"order":1,"department":"Vertrieb","title":"Angebot/AB","required_outputs":["Angebot","Auftragsbestätigung"]},
   {"order":2,"department":"Einkauf","title":"Material sichern","required_outputs":["Bestellung Lieferant"]},
   {"order":3,"department":"Produktion","title":"Fertigen","required_outputs":["Fertigmeldung"]}
 ]'::jsonb),
('square', 'Sonderfertigung Quadrat', 'Vertrieb/Einkauf/Produktion/Versand',
 ARRAY['Vertrieb','Einkauf','Produktion','Versand'],
 '[
   {"order":1,"department":"Vertrieb","title":"Angebot/AB","required_outputs":["Angebot","Auftragsbestätigung"]},
   {"order":2,"department":"Einkauf","title":"Material beschaffen","required_outputs":["Bestellung Lieferant"]},
   {"order":3,"department":"Produktion","title":"Fertigen","required_outputs":["Fertigmeldung"]},
   {"order":4,"department":"Versand","title":"Verpacken & Versenden","required_outputs":["Lieferschein","Sendungsverfolgung"]}
 ]'::jsonb)
ON CONFLICT DO NOTHING;

-- Optionaler FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_process_template_id_fkey'
  ) THEN
    ALTER TABLE public.cases
      ADD CONSTRAINT cases_process_template_id_fkey
      FOREIGN KEY (process_template_id) REFERENCES public.process_templates(id) ON DELETE SET NULL;
  END IF;
END $$;
