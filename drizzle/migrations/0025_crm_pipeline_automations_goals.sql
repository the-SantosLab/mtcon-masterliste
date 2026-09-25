ALTER TABLE public.crm_stage_probabilities ADD COLUMN IF NOT EXISTS rotting_days integer;
UPDATE public.crm_stage_probabilities SET rotting_days = CASE stage::text
  WHEN 'anfrage' THEN 7 WHEN 'qualifikation' THEN 14 WHEN 'angebot_versendet' THEN 14 WHEN 'verhandlung' THEN 21 ELSE NULL END
WHERE rotting_days IS NULL;

ALTER TABLE public.crm_sales_goals DROP CONSTRAINT IF EXISTS crm_sales_goals_metric_check;
ALTER TABLE public.crm_sales_goals ADD CONSTRAINT crm_sales_goals_metric_check
  CHECK (metric = ANY (ARRAY['revenue','won_count','pipeline','activities_done','deals_created']));

CREATE TABLE public.crm_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_event text NOT NULL CHECK (trigger_event IN ('deal_created','stage_changed')),
  trigger_stage deal_stage,
  action_type text NOT NULL CHECK (action_type IN ('create_activity','notify_owner','notify_user')),
  activity_type crm_activity_type,
  subject text NOT NULL,
  body text,
  due_in_days integer NOT NULL DEFAULT 1,
  assignee_id uuid,
  run_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_automations TO authenticated;
GRANT ALL ON public.crm_automations TO service_role;
ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm automations read" ON public.crm_automations FOR SELECT TO authenticated USING (public.has_crm_access(auth.uid()));
CREATE POLICY "crm automations admin write" ON public.crm_automations FOR ALL TO authenticated USING (public.check_is_admin()) WITH CHECK (public.check_is_admin());
CREATE TRIGGER trg_crm_automations_updated BEFORE UPDATE ON public.crm_automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.run_crm_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_event text; v_target uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN v_event := 'deal_created';
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN v_event := 'stage_changed';
  ELSE RETURN NEW; END IF;

  FOR r IN SELECT * FROM crm_automations
    WHERE is_active AND trigger_event = v_event
      AND (trigger_stage IS NULL OR trigger_stage = NEW.stage)
  LOOP
    BEGIN
      v_target := COALESCE(r.assignee_id, NEW.owner_id);
      IF r.action_type = 'create_activity' THEN
        INSERT INTO crm_activities(deal_id, company_id, contact_id, type, subject, body, due_at, owner_id, auto_generated)
        VALUES (NEW.id, NEW.company_id, NEW.primary_contact_id, COALESCE(r.activity_type,'task'),
                r.subject, r.body, now() + make_interval(days => r.due_in_days), v_target, true);
      ELSIF v_target IS NOT NULL THEN
        INSERT INTO notifications(user_id, type, title, body, href)
        VALUES (CASE WHEN r.action_type = 'notify_owner' THEN COALESCE(NEW.owner_id, v_target) ELSE v_target END,
                'crm_automation', r.subject,
                COALESCE(r.body, '') || CASE WHEN r.body IS NULL THEN '' ELSE ' · ' END || NEW.title,
                '/crm/deals/' || NEW.id);
      END IF;
      UPDATE crm_automations SET run_count = run_count + 1, last_run_at = now() WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'crm automation % failed: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_deals_run_automations AFTER INSERT OR UPDATE OF stage ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.run_crm_automations();