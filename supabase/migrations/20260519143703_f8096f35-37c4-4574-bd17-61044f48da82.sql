DROP POLICY IF EXISTS "Admin reads notifications log" ON public.notifications_log;

CREATE POLICY "Participants read notifications log"
ON public.notifications_log
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = notifications_log.vorgang_id
      AND (
        c.created_by = auth.uid()
        OR c.assignee_id = auth.uid()
        OR auth.uid() = ANY(c.watchers)
        OR can_read_dept(c.department_id)
      )
  )
);