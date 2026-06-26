
-- ============================================================
-- BLOCK A: Analytics & Lead-Management
-- ============================================================

-- 1) Stage probabilities (configurable per stage)
CREATE TABLE IF NOT EXISTS public.crm_stage_probabilities (
  stage deal_stage PRIMARY KEY,
  probability numeric NOT NULL CHECK (probability >= 0 AND probability <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.crm_stage_probabilities TO authenticated;
GRANT ALL ON public.crm_stage_probabilities TO service_role;
ALTER TABLE public.crm_stage_probabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stage prob" ON public.crm_stage_probabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write stage prob" ON public.crm_stage_probabilities
  FOR ALL TO authenticated USING (check_is_admin()) WITH CHECK (check_is_admin());

INSERT INTO public.crm_stage_probabilities (stage, probability) VALUES
  ('anfrage', 10),
  ('qualifikation', 25),
  ('angebot_versendet', 50),
  ('verhandlung', 75),
  ('won', 100),
  ('lost', 0)
ON CONFLICT (stage) DO NOTHING;

-- 2) Deal extensions: probability override, expected close, won/lost timestamps
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS probability_override numeric
    CHECK (probability_override IS NULL OR (probability_override >= 0 AND probability_override <= 100)),
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_source lead_source;

CREATE OR REPLACE FUNCTION public.deals_track_won_lost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'won' AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM 'won') THEN
    NEW.won_at := now();
  ELSIF NEW.stage <> 'won' THEN
    NEW.won_at := NULL;
  END IF;
  IF NEW.stage = 'lost' AND (TG_OP = 'INSERT' OR OLD.stage IS DISTINCT FROM 'lost') THEN
    NEW.lost_at := now();
  ELSIF NEW.stage <> 'lost' THEN
    NEW.lost_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS deals_track_won_lost_trg ON public.deals;
CREATE TRIGGER deals_track_won_lost_trg
  BEFORE INSERT OR UPDATE OF stage ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_track_won_lost();

UPDATE public.deals SET won_at = stage_changed_at WHERE stage = 'won' AND won_at IS NULL;
UPDATE public.deals SET lost_at = stage_changed_at WHERE stage = 'lost' AND lost_at IS NULL;

-- 3) Sales Goals
CREATE TABLE IF NOT EXISTS public.crm_sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = team-wide
  period_year int NOT NULL CHECK (period_year BETWEEN 2000 AND 3000),
  period_month int CHECK (period_month BETWEEN 1 AND 12),     -- NULL = annual
  metric text NOT NULL DEFAULT 'revenue'
    CHECK (metric IN ('revenue','won_count','pipeline')),
  target_value numeric NOT NULL CHECK (target_value >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_sales_goals_unique
  ON public.crm_sales_goals (
    coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_year,
    coalesce(period_month, 0),
    metric
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sales_goals TO authenticated;
GRANT ALL ON public.crm_sales_goals TO service_role;
ALTER TABLE public.crm_sales_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read goals" ON public.crm_sales_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage goals" ON public.crm_sales_goals
  FOR ALL TO authenticated USING (check_is_admin()) WITH CHECK (check_is_admin());

CREATE OR REPLACE FUNCTION public.crm_sales_goals_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS crm_sales_goals_touch_trg ON public.crm_sales_goals;
CREATE TRIGGER crm_sales_goals_touch_trg
  BEFORE UPDATE ON public.crm_sales_goals
  FOR EACH ROW EXECUTE FUNCTION public.crm_sales_goals_touch();

-- 4) Lead Scoring Rules
CREATE TABLE IF NOT EXISTS public.crm_lead_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  field text NOT NULL CHECK (field IN (
    'country','industry','source','email_domain','website','has_phone','company_name_contains'
  )),
  operator text NOT NULL DEFAULT 'equals'
    CHECK (operator IN ('equals','contains','not_empty','in')),
  value text,
  points int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_scoring_rules TO authenticated;
GRANT ALL ON public.crm_lead_scoring_rules TO service_role;
ALTER TABLE public.crm_lead_scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read scoring" ON public.crm_lead_scoring_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage scoring" ON public.crm_lead_scoring_rules
  FOR ALL TO authenticated USING (check_is_admin()) WITH CHECK (check_is_admin());

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_calculated_at timestamptz;

CREATE OR REPLACE FUNCTION public.calculate_lead_score(_lead public.leads)
RETURNS int
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  total int := 0;
  r record;
  field_val text;
  matched boolean;
BEGIN
  FOR r IN SELECT * FROM public.crm_lead_scoring_rules WHERE is_active LOOP
    field_val := CASE r.field
      WHEN 'country' THEN _lead.country
      WHEN 'industry' THEN _lead.industry
      WHEN 'source' THEN _lead.source::text
      WHEN 'email_domain' THEN split_part(coalesce(_lead.email,''), '@', 2)
      WHEN 'website' THEN _lead.website
      WHEN 'has_phone' THEN CASE WHEN _lead.phone IS NOT NULL AND length(_lead.phone) > 0 THEN 'true' ELSE 'false' END
      WHEN 'company_name_contains' THEN _lead.company_name
      ELSE NULL
    END;
    matched := false;
    IF r.operator = 'equals' THEN
      matched := lower(coalesce(field_val,'')) = lower(coalesce(r.value,''));
    ELSIF r.operator = 'contains' THEN
      matched := coalesce(r.value,'') <> '' AND position(lower(r.value) IN lower(coalesce(field_val,''))) > 0;
    ELSIF r.operator = 'not_empty' THEN
      matched := field_val IS NOT NULL AND length(field_val) > 0 AND field_val <> 'false';
    ELSIF r.operator = 'in' THEN
      matched := lower(coalesce(field_val,'')) = ANY (
        SELECT lower(trim(x)) FROM unnest(string_to_array(coalesce(r.value,''), ',')) x
      );
    END IF;
    IF matched THEN
      total := total + r.points;
    END IF;
  END LOOP;
  RETURN total;
END $$;

CREATE OR REPLACE FUNCTION public.leads_recalc_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.score := public.calculate_lead_score(NEW);
  NEW.score_calculated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_recalc_score_trg ON public.leads;
CREATE TRIGGER leads_recalc_score_trg
  BEFORE INSERT OR UPDATE OF country, industry, source, email, website, phone, company_name
  ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_recalc_score();

-- 5) Round-Robin Routing
ALTER TABLE public.sales_routing_rules
  ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'fixed'
    CHECK (strategy IN ('fixed','round_robin')),
  ADD COLUMN IF NOT EXISTS pool_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_assigned_index int NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS min_score int NOT NULL DEFAULT 0;

ALTER TABLE public.sales_routing_rules ALTER COLUMN assigned_to DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.leads_apply_routing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  pick uuid;
  idx int;
  pool_size int;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT * FROM public.sales_routing_rules
    WHERE is_active
      AND (match_country IS NULL OR lower(match_country) = lower(coalesce(NEW.country,'')))
      AND (match_industry IS NULL OR lower(match_industry) = lower(coalesce(NEW.industry,'')))
      AND (match_source IS NULL OR match_source = NEW.source::text)
      AND (match_keyword IS NULL OR position(
        lower(match_keyword) IN lower(coalesce(NEW.company_name,'') || ' ' || coalesce(NEW.notes,''))
      ) > 0)
      AND coalesce(min_score, 0) <= coalesce(NEW.score, 0)
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
  LOOP
    pool_size := coalesce(array_length(r.pool_user_ids, 1), 0);
    IF r.strategy = 'round_robin' AND pool_size > 0 THEN
      idx := (r.last_assigned_index + 1) % pool_size;
      pick := r.pool_user_ids[idx + 1];
      UPDATE public.sales_routing_rules SET last_assigned_index = idx WHERE id = r.id;
    ELSE
      pick := r.assigned_to;
    END IF;
    IF pick IS NOT NULL THEN
      NEW.assigned_to := pick;
      NEW.routed_by_rule_id := r.id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- name starts with 'z' so it runs AFTER leads_recalc_score_trg (alphabetical order)
DROP TRIGGER IF EXISTS leads_apply_routing_trg ON public.leads;
DROP TRIGGER IF EXISTS z_leads_apply_routing_trg ON public.leads;
CREATE TRIGGER z_leads_apply_routing_trg
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_apply_routing();
