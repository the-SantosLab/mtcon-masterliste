
CREATE TABLE IF NOT EXISTS public.drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_no text NOT NULL,
  title text,
  current_version int NOT NULL DEFAULT 0,
  current_version_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drawing_no, case_id),
  UNIQUE (drawing_no, project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawings TO authenticated;
GRANT ALL ON public.drawings TO service_role;
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read drawings" ON public.drawings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write drawings" ON public.drawings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.drawing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL DEFAULT 'released' CHECK (status IN ('draft','released','archived','superseded')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  change_note text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_versions TO authenticated;
GRANT ALL ON public.drawing_versions TO service_role;
ALTER TABLE public.drawing_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read drawing_versions" ON public.drawing_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write drawing_versions" ON public.drawing_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_drawings_case ON public.drawings(case_id);
CREATE INDEX IF NOT EXISTS idx_drawings_project ON public.drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_dv_drawing ON public.drawing_versions(drawing_id);

DROP TRIGGER IF EXISTS trg_drawings_updated ON public.drawings;
CREATE TRIGGER trg_drawings_updated BEFORE UPDATE ON public.drawings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- On new version: bump master, archive previous released versions
CREATE OR REPLACE FUNCTION public.on_drawing_version_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'released' THEN
    UPDATE public.drawing_versions
       SET status = 'superseded'
     WHERE drawing_id = NEW.drawing_id
       AND id <> NEW.id
       AND status = 'released';
    UPDATE public.drawings
       SET current_version = NEW.version,
           current_version_id = NEW.id,
           updated_at = now()
     WHERE id = NEW.drawing_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dv_insert ON public.drawing_versions;
CREATE TRIGGER trg_dv_insert AFTER INSERT ON public.drawing_versions
FOR EACH ROW EXECUTE FUNCTION public.on_drawing_version_insert();

-- Storage policies for drawings bucket
CREATE POLICY "auth read drawings bucket" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'drawings');
CREATE POLICY "auth upload drawings bucket" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'drawings');
CREATE POLICY "auth update drawings bucket" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'drawings');
CREATE POLICY "auth delete drawings bucket" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'drawings' AND public.has_role(auth.uid(),'admin'));
