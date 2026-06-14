
-- Vertriebs-Auto-Routing
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS routed_by_rule_id uuid;

CREATE TABLE IF NOT EXISTS public.sales_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  match_country text,
  match_industry text,
  match_source text,
  match_keyword text,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_routing_rules TO authenticated;
GRANT ALL ON public.sales_routing_rules TO service_role;

ALTER TABLE public.sales_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read routing rules" ON public.sales_routing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write routing rules" ON public.sales_routing_rules FOR INSERT TO authenticated WITH CHECK (check_is_admin(auth.uid()));
CREATE POLICY "admin update routing rules" ON public.sales_routing_rules FOR UPDATE TO authenticated USING (check_is_admin(auth.uid()));
CREATE POLICY "admin delete routing rules" ON public.sales_routing_rules FOR DELETE TO authenticated USING (check_is_admin(auth.uid()));

CREATE TRIGGER trg_sales_routing_updated BEFORE UPDATE ON public.sales_routing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-routing function
CREATE OR REPLACE FUNCTION public.apply_sales_routing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.sales_routing_rules%ROWTYPE;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_rule FROM public.sales_routing_rules r
   WHERE r.is_active
     AND (r.match_country  IS NULL OR lower(r.match_country)  = lower(coalesce(NEW.country,'')))
     AND (r.match_industry IS NULL OR lower(r.match_industry) = lower(coalesce(NEW.industry,'')))
     AND (r.match_source   IS NULL OR lower(r.match_source)   = lower(NEW.source::text))
     AND (r.match_keyword  IS NULL OR
          coalesce(NEW.company_name,'') || ' ' || coalesce(NEW.notes,'') || ' ' || coalesce(NEW.email,'')
          ILIKE '%' || r.match_keyword || '%')
   ORDER BY r.priority ASC, r.created_at ASC
   LIMIT 1;
  IF FOUND THEN
    NEW.assigned_to := v_rule.assigned_to;
    NEW.routed_by_rule_id := v_rule.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_sales_routing ON public.leads;
CREATE TRIGGER trg_apply_sales_routing BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.apply_sales_routing();
