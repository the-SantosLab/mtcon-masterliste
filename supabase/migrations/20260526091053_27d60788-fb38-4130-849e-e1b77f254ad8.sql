
CREATE TABLE public.ai_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  content text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ai_prompts"
  ON public.ai_prompts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin insert ai_prompts"
  ON public.ai_prompts FOR INSERT TO authenticated
  WITH CHECK (check_is_admin(auth.uid()));

CREATE POLICY "Admin update ai_prompts"
  ON public.ai_prompts FOR UPDATE TO authenticated
  USING (check_is_admin(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()));

CREATE POLICY "Admin delete ai_prompts"
  ON public.ai_prompts FOR DELETE TO authenticated
  USING (check_is_admin(auth.uid()));

CREATE TRIGGER ai_prompts_set_updated_at
  BEFORE UPDATE ON public.ai_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed mit den aktuell im Code hartkodierten Prompts (Inhalt wird per Edge Function überschrieben/ergänzt)
INSERT INTO public.ai_prompts (key, label, description, content) VALUES
  ('mtiq_chat', 'MTIQ Chat (Vorgang)', 'System-Prompt für den MTIQ-Chat innerhalb eines Vorgangs.', ''),
  ('mtiq_email_intake', 'MTIQ E-Mail Intake', 'Strukturiert eingehende E-Mails zu Vorgängen (Postmark/Webhook).', ''),
  ('mtiq_text_intake', 'MTIQ Text Intake', 'Wandelt freien Text in einen strukturierten Vorgangs-Entwurf um.', ''),
  ('mtiq_reformulate', 'MTIQ Reformulieren', 'Verbessert/Reformuliert kurze Texte (Chat, Notizen).', ''),
  ('mtiq_suggest_subtasks', 'MTIQ Unteraufgaben-Vorschläge', 'Schlägt sinnvolle Unteraufgaben zu einem Vorgang vor.', ''),
  ('mtiq_summarize_case', 'MTIQ Vorgang zusammenfassen', 'Erstellt eine kompakte Zusammenfassung eines Vorgangs.', ''),
  ('mtiq_tool', 'MTIQ Tools (allgemein)', 'Basis-Prompt für Tool-Modus. Platzhalter: {{tool}}.', ''),
  ('analyze_ticket', 'Support Ticket Analyse', 'Analysiert Support-Tickets (Priorität, Kategorie, Vorschläge).', '');
