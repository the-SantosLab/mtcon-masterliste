CREATE POLICY "Creator can read own cases" ON public.cases FOR SELECT TO authenticated
USING (created_by = auth.uid() AND NOT public.is_private_inbox_dept(department_id));