
DROP POLICY IF EXISTS "Assignee, staff or admin can update cases" ON public.cases;

CREATE POLICY "Assignee, staff or admin can update cases"
ON public.cases
FOR UPDATE
USING (
  (
    check_is_admin()
    OR assignee_id = auth.uid()
    OR (assignee_id IS NULL AND has_role(auth.uid(), 'staff'::app_role))
  )
  AND can_write_dept(department_id)
)
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND can_write_dept(department_id)
);
