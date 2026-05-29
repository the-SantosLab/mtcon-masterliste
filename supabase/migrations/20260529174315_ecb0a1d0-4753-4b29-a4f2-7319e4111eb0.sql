CREATE OR REPLACE FUNCTION public.reset_case_completion_on_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('abgeschlossen','verworfen','archiv')
     AND NEW.status NOT IN ('abgeschlossen','verworfen','archiv')
  THEN
    NEW.completed_at := NULL;
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_case_completion_on_reopen ON public.cases;
CREATE TRIGGER trg_reset_case_completion_on_reopen
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.reset_case_completion_on_reopen();