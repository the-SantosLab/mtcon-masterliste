DROP POLICY IF EXISTS "Staff and admin can insert case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Staff and admin can update case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Admin can delete case tasks" ON public.case_tasks;

CREATE POLICY "Admin can insert case tasks"
ON public.case_tasks FOR INSERT TO authenticated
WITH CHECK (check_is_admin());

CREATE POLICY "Admin can update case tasks"
ON public.case_tasks FOR UPDATE TO authenticated
USING (check_is_admin());

CREATE POLICY "Admin can delete case tasks"
ON public.case_tasks FOR DELETE TO authenticated
USING (check_is_admin());