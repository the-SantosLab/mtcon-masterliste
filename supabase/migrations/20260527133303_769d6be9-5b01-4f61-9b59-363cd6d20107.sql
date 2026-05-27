CREATE POLICY "Assigned users can update own case tasks"
ON public.case_tasks
FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid());