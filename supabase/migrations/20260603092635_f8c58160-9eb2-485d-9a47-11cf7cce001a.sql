-- 1) Seal RLS leak: cases without department should NOT be globally readable
CREATE OR REPLACE FUNCTION public.can_read_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    check_is_admin(p_uid)
    OR (p_dept_id IS NOT NULL AND (
      dept_owner(p_dept_id) = p_uid
      OR has_dept_read(p_uid, p_dept_id)
    ));
$function$;

-- 2) Enforce department on new cases via validation trigger
CREATE OR REPLACE FUNCTION public.enforce_case_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.department_id IS NULL THEN
    RAISE EXCEPTION 'Abteilung ist Pflicht für jeden Vorgang.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_department ON public.cases;
CREATE TRIGGER trg_enforce_case_department
BEFORE INSERT ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.enforce_case_department();
