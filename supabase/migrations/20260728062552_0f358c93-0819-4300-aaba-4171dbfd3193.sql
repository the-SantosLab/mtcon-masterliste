
CREATE OR REPLACE FUNCTION public.is_project_manager(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role = 'manager'
  );
$$;

DROP POLICY IF EXISTS "Admin, owner or manager manage project members" ON public.project_members;

CREATE POLICY "Admin, owner or manager manage project members"
ON public.project_members
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  check_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_members.project_id
      AND (p.created_by = auth.uid() OR p.owner_id = auth.uid())
  )
  OR public.is_project_manager(project_members.project_id, auth.uid())
)
WITH CHECK (
  check_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_members.project_id
      AND (p.created_by = auth.uid() OR p.owner_id = auth.uid())
  )
  OR public.is_project_manager(project_members.project_id, auth.uid())
);
