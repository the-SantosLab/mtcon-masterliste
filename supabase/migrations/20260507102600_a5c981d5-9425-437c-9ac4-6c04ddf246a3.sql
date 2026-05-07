DROP POLICY IF EXISTS "Admin can insert case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Admin can update case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Admin can delete case tasks" ON public.case_tasks;

CREATE POLICY "Staff and admin can insert case tasks"
ON public.case_tasks FOR INSERT TO authenticated
WITH CHECK ((check_is_admin() OR has_role(auth.uid(), 'staff'::app_role)) AND can_write_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can update case tasks"
ON public.case_tasks FOR UPDATE TO authenticated
USING ((check_is_admin() OR has_role(auth.uid(), 'staff'::app_role)) AND can_write_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can delete case tasks"
ON public.case_tasks FOR DELETE TO authenticated
USING (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role));