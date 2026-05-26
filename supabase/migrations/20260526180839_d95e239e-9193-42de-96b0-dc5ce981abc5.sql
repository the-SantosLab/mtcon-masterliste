
ALTER TABLE public.case_tasks
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_case_tasks_archived_at ON public.case_tasks(case_id, archived_at);

-- Recompute case urgency, ignoring archived subtasks
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
   WHERE case_id = p_case_id
     AND urgency > 0
     AND archived_at IS NULL;

  IF v_count = 0 THEN
    PERFORM set_config('app.urgency_recompute', '1', true);
    UPDATE public.cases
       SET urgency = 0
     WHERE id = p_case_id
       AND urgency IS DISTINCT FROM 0;
    PERFORM set_config('app.urgency_recompute', '', true);
    RETURN;
  END IF;

  v_new := LEAST(5, GREATEST(0, ROUND(v_avg)::int))::smallint;

  PERFORM set_config('app.urgency_recompute', '1', true);
  UPDATE public.cases
     SET urgency = v_new
   WHERE id = p_case_id
     AND urgency IS DISTINCT FROM v_new;
  PERFORM set_config('app.urgency_recompute', '', true);
END;
$$;

-- Update trigger to also fire on archived_at changes
DROP TRIGGER IF EXISTS case_tasks_recompute_case_urgency ON public.case_tasks;
CREATE TRIGGER case_tasks_recompute_case_urgency
AFTER INSERT OR UPDATE OF urgency, case_id, archived_at OR DELETE ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_case_tasks_recompute_case_urgency();

-- Backfill: recompute all cases once
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.cases LOOP
    PERFORM public.recompute_case_urgency(r.id);
  END LOOP;
END $$;
