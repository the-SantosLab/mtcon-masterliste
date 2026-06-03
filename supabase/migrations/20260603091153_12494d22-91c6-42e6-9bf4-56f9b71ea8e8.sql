-- Helper: ist der User Leiter (lead) dieser Abteilung?
CREATE OR REPLACE FUNCTION public.is_dept_lead(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE department_id = p_dept_id AND user_id = p_uid AND role = 'lead'
  ) OR EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = p_dept_id AND manager_user_id = p_uid
  );
$$;

-- Helper: führt der User irgendeine Abteilung?
CREATE OR REPLACE FUNCTION public.is_any_dept_lead(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE user_id = p_uid AND role = 'lead'
  ) OR EXISTS (
    SELECT 1 FROM public.departments
    WHERE manager_user_id = p_uid
  );
$$;

-- Leiter dürfen Mitglieder ihrer eigenen Abteilung verwalten
CREATE POLICY "Dept lead can insert department members"
ON public.department_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_dept_lead(department_id));

CREATE POLICY "Dept lead can update department members"
ON public.department_members
FOR UPDATE
TO authenticated
USING (public.is_dept_lead(department_id))
WITH CHECK (public.is_dept_lead(department_id));

CREATE POLICY "Dept lead can delete department members"
ON public.department_members
FOR DELETE
TO authenticated
USING (public.is_dept_lead(department_id));