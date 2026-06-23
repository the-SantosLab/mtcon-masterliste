DROP POLICY IF EXISTS "Authenticated can read cases" ON public.cases;
CREATE POLICY "Authenticated can read cases" ON public.cases FOR SELECT
USING (
  (public.is_private_inbox_dept(department_id) AND (
     created_by = auth.uid()
     OR assignee_id = auth.uid()
     OR public.dept_owner(department_id) = auth.uid()
     OR public.check_is_admin()
     OR auth.uid() = ANY (COALESCE(watchers, ARRAY[]::uuid[]))
     OR EXISTS (
       SELECT 1 FROM case_tasks t
       WHERE t.case_id = cases.id
         AND t.assigned_to = auth.uid()
     )
  ))
  OR (NOT public.is_private_inbox_dept(department_id) AND (
    can_read_dept(department_id)
    OR assignee_id = auth.uid()
    OR auth.uid() = ANY (COALESCE(watchers, ARRAY[]::uuid[]))
    OR EXISTS (
      SELECT 1 FROM case_tasks t
      WHERE t.case_id = cases.id
        AND (t.assigned_to = auth.uid() OR can_read_dept(t.department_id))
    )
  ))
);