
-- 1. Spalten
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS urgency_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgency_override_by uuid,
  ADD COLUMN IF NOT EXISTS urgency_override_at timestamptz;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS urgency_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgency_override_by uuid,
  ADD COLUMN IF NOT EXISTS urgency_override_at timestamptz;

-- 2. Recompute Funktionen
CREATE OR REPLACE FUNCTION public.recompute_case_urgency(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avg numeric;
  v_count int;
  v_new smallint;
  v_override boolean;
BEGIN
  SELECT urgency_override INTO v_override FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND OR v_override THEN RETURN; END IF;

  SELECT AVG(urgency)::numeric, COUNT(*)
    INTO v_avg, v_count
    FROM public.case_tasks
   WHERE case_id = p_case_id AND urgency > 0;

  IF v_count = 0 THEN RETURN; END IF;

  v_new := LEAST(5, GREATEST(0, ROUND(v_avg)::int))::smallint;

  -- Bypass guard via local replication role
  PERFORM set_config('app.urgency_recompute', '1', true);
  UPDATE public.cases
     SET urgency = v_new
   WHERE id = p_case_id
     AND urgency IS DISTINCT FROM v_new;
  PERFORM set_config('app.urgency_recompute', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_project_urgency(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max smallint;
  v_count int;
  v_override boolean;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  SELECT urgency_override INTO v_override FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_override THEN RETURN; END IF;

  SELECT COALESCE(MAX(urgency), 0)::smallint, COUNT(*)
    INTO v_max, v_count
    FROM public.cases
   WHERE project_id = p_project_id AND COALESCE(deleted, false) = false;

  IF v_count = 0 THEN RETURN; END IF;

  PERFORM set_config('app.urgency_recompute', '1', true);
  UPDATE public.projects
     SET urgency = v_max
   WHERE id = p_project_id
     AND urgency IS DISTINCT FROM v_max;
  PERFORM set_config('app.urgency_recompute', '', true);
END;
$$;

-- 3. Trigger-Funktionen
CREATE OR REPLACE FUNCTION public.trg_case_tasks_recompute_case_urgency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_case_urgency(OLD.case_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.case_id IS DISTINCT FROM NEW.case_id THEN
    PERFORM public.recompute_case_urgency(OLD.case_id);
    PERFORM public.recompute_case_urgency(NEW.case_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_case_urgency(NEW.case_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cases_recompute_project_urgency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_project_urgency(OLD.project_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
      PERFORM public.recompute_project_urgency(OLD.project_id);
    END IF;
    PERFORM public.recompute_project_urgency(NEW.project_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_project_urgency(NEW.project_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS case_tasks_recompute_case_urgency ON public.case_tasks;
CREATE TRIGGER case_tasks_recompute_case_urgency
AFTER INSERT OR UPDATE OF urgency, case_id OR DELETE ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_case_tasks_recompute_case_urgency();

DROP TRIGGER IF EXISTS cases_recompute_project_urgency ON public.cases;
CREATE TRIGGER cases_recompute_project_urgency
AFTER INSERT OR UPDATE OF urgency, project_id, deleted OR DELETE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.trg_cases_recompute_project_urgency();

-- 5. Guards
CREATE OR REPLACE FUNCTION public.cases_urgency_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_tasks boolean;
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.urgency IS NOT DISTINCT FROM OLD.urgency
     AND NEW.urgency_override IS NOT DISTINCT FROM OLD.urgency_override THEN
    RETURN NEW;
  END IF;

  -- System-/Trigger-Pfad: kein User oder Recompute-Flag
  IF v_uid IS NULL OR current_setting('app.urgency_recompute', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.check_is_admin(v_uid) THEN
    IF NEW.urgency IS DISTINCT FROM OLD.urgency
       AND NEW.urgency_override IS NOT DISTINCT FROM OLD.urgency_override THEN
      SELECT EXISTS(SELECT 1 FROM public.case_tasks WHERE case_id = NEW.id AND urgency > 0) INTO v_has_tasks;
      IF v_has_tasks THEN
        NEW.urgency_override := true;
        NEW.urgency_override_by := v_uid;
        NEW.urgency_override_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.case_tasks WHERE case_id = NEW.id AND urgency > 0) INTO v_has_tasks;
  IF v_has_tasks THEN
    RAISE EXCEPTION 'Dringlichkeit wird aus Unteraufgaben abgeleitet und kann nur von Admins manuell gesetzt werden.';
  END IF;
  NEW.urgency_override := false;
  NEW.urgency_override_by := NULL;
  NEW.urgency_override_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_urgency_write_guard ON public.cases;
CREATE TRIGGER cases_urgency_write_guard
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.cases_urgency_write_guard();

CREATE OR REPLACE FUNCTION public.projects_urgency_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_cases boolean;
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.urgency IS NOT DISTINCT FROM OLD.urgency
     AND NEW.urgency_override IS NOT DISTINCT FROM OLD.urgency_override THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL OR current_setting('app.urgency_recompute', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.check_is_admin(v_uid) THEN
    IF NEW.urgency IS DISTINCT FROM OLD.urgency
       AND NEW.urgency_override IS NOT DISTINCT FROM OLD.urgency_override THEN
      SELECT EXISTS(SELECT 1 FROM public.cases WHERE project_id = NEW.id AND COALESCE(deleted,false)=false) INTO v_has_cases;
      IF v_has_cases THEN
        NEW.urgency_override := true;
        NEW.urgency_override_by := v_uid;
        NEW.urgency_override_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.cases WHERE project_id = NEW.id AND COALESCE(deleted,false)=false) INTO v_has_cases;
  IF v_has_cases THEN
    RAISE EXCEPTION 'Projekt-Dringlichkeit wird aus Vorgängen abgeleitet und kann nur von Admins manuell gesetzt werden.';
  END IF;
  NEW.urgency_override := false;
  NEW.urgency_override_by := NULL;
  NEW.urgency_override_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_urgency_write_guard ON public.projects;
CREATE TRIGGER projects_urgency_write_guard
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_urgency_write_guard();

-- 6. Backfill
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.cases WHERE COALESCE(deleted,false)=false LOOP
    PERFORM public.recompute_case_urgency(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.projects LOOP
    PERFORM public.recompute_project_urgency(r.id);
  END LOOP;
END $$;
