DROP POLICY IF EXISTS "Admin or project owner manages members" ON public.project_members;

CREATE POLICY "Admin, owner or manager manage project members"
  ON public.project_members FOR ALL
  TO authenticated
  USING (
    public.check_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND (p.created_by = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_members.project_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'manager'
    )
  )
  WITH CHECK (
    public.check_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND (p.created_by = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = project_members.project_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'manager'
    )
  );