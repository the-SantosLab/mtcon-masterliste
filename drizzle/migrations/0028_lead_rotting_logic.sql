-- Zeitpunkt des letzten Statuswechsels je Lead
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
UPDATE public.leads SET status_changed_at = COALESCE(updated_at, created_at) WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.leads_touch_status_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_changed ON public.leads;
CREATE TRIGGER trg_leads_status_changed
BEFORE UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_touch_status_changed();

-- Fäulnis-Grenzen je Lead-Stufe (Tage ohne Statuswechsel / erledigte Aktivität)
CREATE TABLE public.lead_rotting_config (
  stage text PRIMARY KEY,
  rotting_days integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lead_rotting_config (stage, rotting_days) VALUES
  ('neu', 14), ('qualifiziert', 21), ('eingeschrieben', 30)
ON CONFLICT (stage) DO NOTHING;

GRANT SELECT ON public.lead_rotting_config TO authenticated;
GRANT ALL ON public.lead_rotting_config TO service_role;

ALTER TABLE public.lead_rotting_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users read lead rotting config"
ON public.lead_rotting_config FOR SELECT TO authenticated
USING (public.is_internal_user());

CREATE POLICY "Admins manage lead rotting config"
ON public.lead_rotting_config FOR ALL TO authenticated
USING (public.check_is_admin(auth.uid()))
WITH CHECK (public.check_is_admin(auth.uid()));