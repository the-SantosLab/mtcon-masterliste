DROP POLICY IF EXISTS "Staff and admin can delete case tasks" ON public.case_tasks;

CREATE POLICY "Staff and admin can delete case tasks"
ON public.case_tasks
FOR DELETE
TO authenticated
USING (
  check_is_admin()
  OR (
    has_role(auth.uid(), 'staff'::app_role)
    AND (
      can_write_dept(case_department(case_id))
      OR can_write_dept(department_id)
      OR assigned_to = auth.uid()
    )
  )
);