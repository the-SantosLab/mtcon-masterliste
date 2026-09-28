ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_companies_parent ON public.companies(parent_company_id);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS partner_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS protected_project text,
  ADD COLUMN IF NOT EXISTS protected_until date;

CREATE TABLE public.company_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'standort',
  street text, zip text, city text, country text, phone text, email text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_locations TO authenticated;
GRANT ALL ON public.company_locations TO service_role;
ALTER TABLE public.company_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm read locations" ON public.company_locations FOR SELECT TO authenticated USING (public.has_crm_access(auth.uid()) OR public.is_internal_user());
CREATE POLICY "crm write locations" ON public.company_locations FOR ALL TO authenticated USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));

CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  website text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm all competitors" ON public.competitors FOR ALL TO authenticated USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));

CREATE TABLE public.deal_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  their_price numeric, strengths text, weaknesses text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, competitor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_competitors TO authenticated;
GRANT ALL ON public.deal_competitors TO service_role;
ALTER TABLE public.deal_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm all deal competitors" ON public.deal_competitors FOR ALL TO authenticated USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));

CREATE TABLE public.crm_visit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.company_locations(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT current_date,
  participants text, purpose text, result text, next_steps text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_visit_reports TO authenticated;
GRANT ALL ON public.crm_visit_reports TO service_role;
ALTER TABLE public.crm_visit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm all visit reports" ON public.crm_visit_reports FOR ALL TO authenticated USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));