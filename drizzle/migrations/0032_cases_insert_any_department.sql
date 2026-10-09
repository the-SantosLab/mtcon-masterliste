DROP POLICY IF EXISTS "Staff and admin can insert cases" ON public.cases;
CREATE POLICY "Staff and admin can insert cases" ON public.cases FOR INSERT TO authenticated
WITH CHECK ((public.check_is_admin() OR public.has_role(auth.uid(), 'staff'::app_role)) AND (department_id IS NOT NULL OR project_id IS NOT NULL));