-- BUG-2026-0151: Dringlichkeit abgeschlossener Vorgänge zurücksetzen

-- 1) Effektive Dringlichkeit ist bei Endstatus immer 0
CREATE OR REPLACE FUNCTION public.recalc_case_effective_urgency(_case_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_urg smallint;
  task_urg smallint;
  new_eff smallint;
  v_status public.case_status;
BEGIN
  SELECT COALESCE(urgency, 0), status INTO base_urg, v_status FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_status IN ('abgeschlossen', 'verworfen', 'archiv') THEN
    new_eff := 0;
  ELSE
    SELECT COALESCE(MAX(urgency), 0) INTO task_urg
    FROM public.case_tasks
    WHERE case_id = _case_id
      AND completed = false;
    new_eff := GREATEST(COALESCE(base_urg, 0), COALESCE(task_urg, 0));
  END IF;

  UPDATE public.cases
     SET effective_urgency = new_eff
   WHERE id = _case_id
     AND effective_urgency IS DISTINCT FROM new_eff;
END;
$function$;

-- 2) Beim Wechsel in einen Endstatus die Dringlichkeit zurücksetzen
CREATE OR REPLACE FUNCTION public.cases_reset_urgency_on_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('abgeschlossen', 'verworfen', 'archiv') THEN
    NEW.urgency := 0;
    NEW.effective_urgency := 0;
    NEW.urgency_override := false;
    NEW.urgency_override_by := NULL;
    NEW.urgency_override_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cases_reset_urgency_on_close ON public.cases;
CREATE TRIGGER trg_cases_reset_urgency_on_close
  BEFORE INSERT OR UPDATE OF status ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.cases_reset_urgency_on_close();

-- 3) Projekt-Dringlichkeit ignoriert abgeschlossene Vorgänge
CREATE OR REPLACE FUNCTION public.recompute_project_urgency(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   WHERE project_id = p_project_id
     AND COALESCE(deleted, false) = false
     AND status NOT IN ('abgeschlossen', 'verworfen', 'archiv');

  IF v_count = 0 THEN v_max := 0; END IF;

  PERFORM set_config('app.urgency_recompute', '1', true);
  UPDATE public.projects
     SET urgency = v_max
   WHERE id = p_project_id
     AND urgency IS DISTINCT FROM v_max;
  PERFORM set_config('app.urgency_recompute', '', true);
END;
$function$;

-- 4) Bestehende abgeschlossene Vorgänge bereinigen
DO $$
DECLARE r record;
BEGIN
  PERFORM set_config('app.urgency_recompute', '1', true);
  UPDATE public.cases
     SET urgency = 0,
         effective_urgency = 0,
         urgency_override = false,
         urgency_override_by = NULL,
         urgency_override_at = NULL
   WHERE status IN ('abgeschlossen', 'verworfen', 'archiv')
     AND (COALESCE(urgency, 0) > 0 OR COALESCE(effective_urgency, 0) > 0 OR COALESCE(urgency_override, false));
  PERFORM set_config('app.urgency_recompute', '', true);

  FOR r IN SELECT DISTINCT project_id FROM public.cases WHERE project_id IS NOT NULL LOOP
    PERFORM public.recompute_project_urgency(r.project_id);
  END LOOP;
END $$;