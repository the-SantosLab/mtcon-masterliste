DROP POLICY IF EXISTS "Staff and admin can insert cases" ON public.cases;

CREATE POLICY "Staff and admin can insert cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND (
    can_write_dept(department_id)
    OR project_id IS NOT NULL
  )
);