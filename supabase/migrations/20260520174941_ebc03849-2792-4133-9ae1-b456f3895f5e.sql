DROP POLICY IF EXISTS "Users see own or member projects" ON public.projects;
CREATE POLICY "Users see own or member projects" ON public.projects
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR owner_id = auth.uid()
  OR is_project_member(id, auth.uid())
  OR (visibility = 'department' AND can_read_dept(department_id))
);