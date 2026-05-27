DROP POLICY IF EXISTS freeze_closed_cases_update ON public.cases;
CREATE POLICY freeze_closed_cases_update
ON public.cases
FOR UPDATE
USING (
  check_is_admin(auth.uid())
  OR (status <> ALL (ARRAY['abgeschlossen'::case_status, 'verworfen'::case_status, 'archiv'::case_status]))
)
WITH CHECK (true);