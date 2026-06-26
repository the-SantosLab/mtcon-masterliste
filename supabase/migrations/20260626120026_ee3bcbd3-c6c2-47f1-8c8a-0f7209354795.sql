
-- Tags
CREATE TABLE public.crm_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  scope TEXT NOT NULL CHECK (scope IN ('company','deal','contact','lead','any')) DEFAULT 'any',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, scope)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags TO authenticated;
GRANT ALL ON public.crm_tags TO service_role;
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tags" ON public.crm_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tags" ON public.crm_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.crm_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id UUID NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company','deal','contact','lead')),
  entity_id UUID NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_crm_tag_assignments_entity ON public.crm_tag_assignments(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tag_assignments TO authenticated;
GRANT ALL ON public.crm_tag_assignments TO service_role;
ALTER TABLE public.crm_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tag_assign" ON public.crm_tag_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tag_assign" ON public.crm_tag_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Saved views
CREATE TABLE public.crm_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('companies','deals','contacts','leads','activities')),
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_saved_views_user ON public.crm_saved_views(user_id, scope);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_saved_views TO authenticated;
GRANT ALL ON public.crm_saved_views TO service_role;
ALTER TABLE public.crm_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own or shared" ON public.crm_saved_views FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);
CREATE POLICY "manage own views" ON public.crm_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_crm_saved_views_updated
BEFORE UPDATE ON public.crm_saved_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contact extensions
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS salutation TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ;
