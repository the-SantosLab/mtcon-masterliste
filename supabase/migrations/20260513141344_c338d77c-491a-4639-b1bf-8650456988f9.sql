
-- ============= Phase 3 Step A: Wiki, Leads, Projektschutz =============

-- 1) Project Protection erweitern
DO $$ BEGIN
  CREATE TYPE public.protection_scope AS ENUM ('global','department','subsidiary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.protection_status AS ENUM ('aktiv','abgelaufen','strittig');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_protection
  ADD COLUMN IF NOT EXISTS distributor_name text,
  ADD COLUMN IF NOT EXISTS distributor_company_id uuid,
  ADD COLUMN IF NOT EXISTS scope_type public.protection_scope NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS scope_detail text,
  ADD COLUMN IF NOT EXISTS status public.protection_status NOT NULL DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.project_protection ENABLE ROW LEVEL SECURITY;

-- 2) Leads
DO $$ BEGIN
  CREATE TYPE public.lead_status AS ENUM ('neu','qualifiziert','eingeschrieben','konvertiert','abgelehnt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_source AS ENUM ('manuell','csv','linkedin','look-a-like');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  website text,
  country text,
  industry text,
  contact_name text,
  email text,
  phone text,
  source public.lead_source NOT NULL DEFAULT 'manuell',
  status public.lead_status NOT NULL DEFAULT 'neu',
  notes text,
  rejection_reason text,
  converted_company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));
CREATE POLICY "staff update" ON public.leads FOR UPDATE TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));
CREATE POLICY "admin delete" ON public.leads FOR DELETE TO authenticated USING (check_is_admin());

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Wiki
CREATE TABLE IF NOT EXISTS public.wiki_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read" ON public.wiki_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.wiki_categories FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));

CREATE TABLE IF NOT EXISTS public.wiki_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.wiki_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read" ON public.wiki_articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.wiki_articles FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));

CREATE TRIGGER trg_wiki_articles_updated BEFORE UPDATE ON public.wiki_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_wiki_articles_search ON public.wiki_articles USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,'')));

CREATE TABLE IF NOT EXISTS public.wiki_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.wiki_articles(id) ON DELETE CASCADE,
  body text NOT NULL,
  title text,
  saved_by uuid,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read" ON public.wiki_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "system insert" ON public.wiki_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin delete" ON public.wiki_versions FOR DELETE TO authenticated USING (check_is_admin());

-- Trigger: keep last 3 versions per article on update
CREATE OR REPLACE FUNCTION public.snapshot_wiki_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (NEW.body IS DISTINCT FROM OLD.body) OR (NEW.title IS DISTINCT FROM OLD.title) THEN
    INSERT INTO public.wiki_versions(article_id, body, title, saved_by)
    VALUES (OLD.id, OLD.body, OLD.title, OLD.updated_by);
    DELETE FROM public.wiki_versions
      WHERE article_id = OLD.id
        AND id NOT IN (
          SELECT id FROM public.wiki_versions
            WHERE article_id = OLD.id
            ORDER BY saved_at DESC
            LIMIT 3
        );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wiki_articles_snapshot ON public.wiki_articles;
CREATE TRIGGER trg_wiki_articles_snapshot BEFORE UPDATE ON public.wiki_articles
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_wiki_version();
