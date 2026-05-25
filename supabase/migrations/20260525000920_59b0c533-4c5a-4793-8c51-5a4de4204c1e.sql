-- Effective urgency rollup: max(case.urgency, max(open subtasks urgency))
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS effective_urgency smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalc_case_effective_urgency(_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_urg smallint;
  task_urg smallint;
  new_eff smallint;
BEGIN
  SELECT COALESCE(urgency, 0) INTO base_urg FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(MAX(urgency), 0) INTO task_urg
  FROM public.case_tasks
  WHERE case_id = _case_id
    AND completed = false;

  new_eff := GREATEST(COALESCE(base_urg, 0), COALESCE(task_urg, 0));

  UPDATE public.cases
     SET effective_urgency = new_eff
   WHERE id = _case_id
     AND effective_urgency IS DISTINCT FROM new_eff;
END;
$$;

-- Trigger on case_tasks: any change recalculates the parent case
CREATE OR REPLACE FUNCTION public.trg_case_tasks_recalc_urgency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_case_effective_urgency(OLD.case_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.case_id IS DISTINCT FROM NEW.case_id THEN
    PERFORM public.recalc_case_effective_urgency(OLD.case_id);
    PERFORM public.recalc_case_effective_urgency(NEW.case_id);
    RETURN NEW;
  ELSE
    PERFORM public.recalc_case_effective_urgency(NEW.case_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS case_tasks_recalc_urgency ON public.case_tasks;
CREATE TRIGGER case_tasks_recalc_urgency
AFTER INSERT OR UPDATE OF urgency, completed, case_id OR DELETE
ON public.case_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trg_case_tasks_recalc_urgency();

-- Trigger on cases: recalc when base urgency changes
CREATE OR REPLACE FUNCTION public.trg_cases_recalc_urgency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_case_effective_urgency(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_recalc_urgency ON public.cases;
CREATE TRIGGER cases_recalc_urgency
AFTER INSERT OR UPDATE OF urgency
ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.trg_cases_recalc_urgency();

-- Backfill existing rows
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.cases LOOP
    PERFORM public.recalc_case_effective_urgency(r.id);
  END LOOP;
END$$;

CREATE INDEX IF NOT EXISTS idx_cases_effective_urgency ON public.cases(effective_urgency);