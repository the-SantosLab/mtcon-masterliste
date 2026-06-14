
CREATE TABLE IF NOT EXISTS public.dept_folder_templates (
  department_id uuid PRIMARY KEY REFERENCES public.departments(id) ON DELETE CASCADE,
  folders text[] NOT NULL DEFAULT ARRAY[]::text[],
  bucket text NOT NULL DEFAULT 'case-attachments',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dept_folder_templates TO authenticated;
GRANT ALL ON public.dept_folder_templates TO service_role;
ALTER TABLE public.dept_folder_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read folder templates" ON public.dept_folder_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage folder templates" ON public.dept_folder_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed Konstruktion
INSERT INTO public.dept_folder_templates (department_id, folders, bucket)
VALUES ('b0000001-0000-0000-0000-000000000001', ARRAY['01_Eingang','02_Konstruktion','03_Freigabe'], 'case-attachments')
ON CONFLICT (department_id) DO NOTHING;
