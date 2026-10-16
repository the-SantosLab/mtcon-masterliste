CREATE TABLE public.drawing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.drawing_categories(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_categories TO authenticated;
GRANT ALL ON public.drawing_categories TO service_role;
ALTER TABLE public.drawing_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read drawing_categories" ON public.drawing_categories FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write drawing_categories" ON public.drawing_categories FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

ALTER TABLE public.drawings
  ADD COLUMN category_id uuid REFERENCES public.drawing_categories(id) ON DELETE SET NULL,
  ADD COLUMN subcategory_id uuid REFERENCES public.drawing_categories(id) ON DELETE SET NULL,
  ADD COLUMN manufacturer text,
  ADD COLUMN part_name text,
  ADD COLUMN price numeric,
  ADD COLUMN price_note text,
  ADD COLUMN note text,
  ADD COLUMN article_art_nr text;

CREATE TABLE public.drawing_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_parameters TO authenticated;
GRANT ALL ON public.drawing_parameters TO service_role;
ALTER TABLE public.drawing_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read drawing_parameters" ON public.drawing_parameters FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write drawing_parameters" ON public.drawing_parameters FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

CREATE TABLE public.drawing_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_files TO authenticated;
GRANT ALL ON public.drawing_files TO service_role;
ALTER TABLE public.drawing_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read drawing_files" ON public.drawing_files FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write drawing_files" ON public.drawing_files FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

CREATE TABLE public.drawing_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_no text NOT NULL UNIQUE,
  title text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_sets TO authenticated;
GRANT ALL ON public.drawing_sets TO service_role;
ALTER TABLE public.drawing_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read drawing_sets" ON public.drawing_sets FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write drawing_sets" ON public.drawing_sets FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

CREATE TABLE public.drawing_set_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.drawing_sets(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  pinned_version integer,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, drawing_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_set_items TO authenticated;
GRANT ALL ON public.drawing_set_items TO service_role;
ALTER TABLE public.drawing_set_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read drawing_set_items" ON public.drawing_set_items FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "internal write drawing_set_items" ON public.drawing_set_items FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());