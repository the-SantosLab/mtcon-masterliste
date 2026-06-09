DROP POLICY IF EXISTS "Authenticated can read activity" ON public.case_activity;

CREATE POLICY "Authenticated can read activity"
ON public.case_activity
FOR SELECT
USING (
  can_read_dept(case_department(case_id))
  OR check_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_activity.case_id
      AND (
        c.created_by = auth.uid()
        OR c.assignee_id = auth.uid()
        OR auth.uid() = ANY (COALESCE(c.watchers, ARRAY[]::uuid[]))
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.case_tasks t
    WHERE t.case_id = case_activity.case_id
      AND (t.assigned_to = auth.uid() OR can_read_dept(t.department_id))
  )
);