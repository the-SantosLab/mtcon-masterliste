
-- Vorgang Templates
CREATE TABLE public.case_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.case_template_departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.case_templates(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  UNIQUE(template_id, department_id)
);

CREATE TABLE public.case_template_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.case_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_role TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_template_tasks_template ON public.case_template_tasks(template_id, order_index);
CREATE INDEX idx_case_template_departments_template ON public.case_template_departments(template_id);
CREATE INDEX idx_case_template_departments_dept ON public.case_template_departments(department_id);

ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_template_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_template_tasks ENABLE ROW LEVEL SECURITY;

-- RLS: read for all authenticated, write only for admins
CREATE POLICY "Authenticated read templates" ON public.case_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages templates" ON public.case_templates
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated read template departments" ON public.case_template_departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages template departments" ON public.case_template_departments
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated read template tasks" ON public.case_template_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages template tasks" ON public.case_template_tasks
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- updated_at trigger
CREATE TRIGGER update_case_templates_updated_at
  BEFORE UPDATE ON public.case_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed pre-built templates
DO $$
DECLARE
  v_hr UUID := '1da38f6e-5530-4b01-a27e-89d153668b7c';
  v_kon UUID := 'b0000001-0000-0000-0000-000000000001';
  v_ver UUID := 'b0000003-0000-0000-0000-000000000001';
  v_mkt UUID := 'b0000004-0000-0000-0000-000000000004';
  v_verw UUID := 'a0000001-0000-0000-0000-000000000004';
  v_tpl UUID;
BEGIN
  -- 1. HR Onboarding
  INSERT INTO public.case_templates (title, description) VALUES
    ('HR Onboarding', 'Standard-Ablauf für die Aufnahme neuer Mitarbeiter') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES (v_tpl, v_hr);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Arbeitsvertrag vorbereiten', 0, v_hr),
    (v_tpl, 'Arbeitsplatz einrichten', 1, v_hr),
    (v_tpl, 'IT-Zugänge anlegen', 2, NULL),
    (v_tpl, 'Einarbeitungsplan erstellen', 3, v_hr),
    (v_tpl, 'Willkommensgespräch durchführen', 4, v_hr);

  -- 2. Artikelnummer-Anlage / Zeichnung & 3D-Erstellung
  INSERT INTO public.case_templates (title, description) VALUES
    ('Artikelnummer-Anlage / Zeichnung & 3D-Erstellung', 'Anlage einer neuen Artikelnummer inkl. technischer Dokumentation') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES (v_tpl, v_kon);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Artikelnummer im ERP anlegen', 0, v_kon),
    (v_tpl, '2D-Zeichnung erstellen', 1, v_kon),
    (v_tpl, '3D-Modell erstellen', 2, v_kon),
    (v_tpl, 'Stückliste hinterlegen', 3, v_kon),
    (v_tpl, 'Technische Freigabe', 4, v_kon);

  -- 3. Kundenzeichnung erstellen
  INSERT INTO public.case_templates (title, description) VALUES
    ('Kundenzeichnung erstellen', 'Erstellung einer Zeichnung für den Kunden') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES
    (v_tpl, v_kon), (v_tpl, v_ver);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Kundenanforderungen klären', 0, v_ver),
    (v_tpl, 'Zeichnung erstellen', 1, v_kon),
    (v_tpl, 'Interne Prüfung', 2, v_kon),
    (v_tpl, 'Kundenfreigabe einholen', 3, v_ver);

  -- 4. Freigabe Konstruktion
  INSERT INTO public.case_templates (title, description) VALUES
    ('Freigabe Konstruktion', 'Konstruktive Freigabe eines Bauteils oder einer Baugruppe') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES (v_tpl, v_kon);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Konstruktionsunterlagen prüfen', 0, v_kon),
    (v_tpl, 'Toleranzen und Maße verifizieren', 1, v_kon),
    (v_tpl, 'Freigabe-Vermerk erstellen', 2, v_kon),
    (v_tpl, 'Dokumentation ablegen', 3, v_kon);

  -- 5. Marketing-Aufgabe
  INSERT INTO public.case_templates (title, description) VALUES
    ('Marketing-Aufgabe', 'Standard-Ablauf für eine Marketing-Aktivität') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES (v_tpl, v_mkt);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Briefing erstellen', 0, v_mkt),
    (v_tpl, 'Inhalte / Assets vorbereiten', 1, v_mkt),
    (v_tpl, 'Interne Abstimmung', 2, v_mkt),
    (v_tpl, 'Veröffentlichung', 3, v_mkt),
    (v_tpl, 'Erfolgskontrolle', 4, v_mkt);

  -- 6. ERP Verlinkung / Dokumentenablage
  INSERT INTO public.case_templates (title, description) VALUES
    ('ERP Verlinkung / Dokumentenablage', 'Verknüpfung von Dokumenten im ERP-System') RETURNING id INTO v_tpl;
  INSERT INTO public.case_template_departments (template_id, department_id) VALUES (v_tpl, v_verw);
  INSERT INTO public.case_template_tasks (template_id, title, order_index, department_id) VALUES
    (v_tpl, 'Dokumente sammeln', 0, v_verw),
    (v_tpl, 'Im ERP verlinken', 1, v_verw),
    (v_tpl, 'In Ordnerstruktur ablegen', 2, v_verw),
    (v_tpl, 'Zugriffsrechte prüfen', 3, v_verw);
END $$;
