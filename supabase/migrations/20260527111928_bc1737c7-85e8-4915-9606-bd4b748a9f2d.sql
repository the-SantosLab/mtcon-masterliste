DROP POLICY IF EXISTS "Assignee, staff or admin can update cases" ON public.cases;

CREATE POLICY "Involved users can update cases"
ON public.cases
FOR UPDATE
TO public
USING (
  check_is_admin()
  OR assignee_id = auth.uid()
  OR created_by = auth.uid()
  OR auth.uid() = ANY (COALESCE(watchers, ARRAY[]::uuid[]))
  OR ((assignee_id IS NULL) AND has_role(auth.uid(), 'staff'::app_role) AND can_write_dept(department_id))
  OR (has_role(auth.uid(), 'staff'::app_role) AND can_write_dept(department_id))
)
WITH CHECK (
  check_is_admin()
  OR assignee_id = auth.uid()
  OR created_by = auth.uid()
  OR auth.uid() = ANY (COALESCE(watchers, ARRAY[]::uuid[]))
  OR (has_role(auth.uid(), 'staff'::app_role) AND can_write_dept(department_id))
);