
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS private_inbox boolean NOT NULL DEFAULT false;

UPDATE public.departments SET private_inbox = true WHERE id = '231e48f6-bac5-4dd0-8f69-a713d81c9fc0';

CREATE OR REPLACE FUNCTION public.is_private_inbox_dept(p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT private_inbox FROM public.departments WHERE id = p_dept_id), false);
$$;

-- Update cases read policy: include created_by for private_inbox depts
DROP POLICY IF EXISTS "Authenticated can read cases" ON public.cases;
CREATE POLICY "Authenticated can read cases" ON public.cases FOR SELECT
USING (
  (public.is_private_inbox_dept(department_id) AND (
     created_by = auth.uid()
     OR assignee_id = auth.uid()
     OR public.dept_owner(department_id) = auth.uid()
     OR public.check_is_admin()
  ))
  OR (NOT public.is_private_inbox_dept(department_id) AND (
    can_read_dept(department_id)
    OR assignee_id = auth.uid()
    OR auth.uid() = ANY (COALESCE(watchers, ARRAY[]::uuid[]))
    OR EXISTS (
      SELECT 1 FROM case_tasks t
      WHERE t.case_id = cases.id
        AND (t.assigned_to = auth.uid() OR can_read_dept(t.department_id))
    )
  ))
);

-- Update cases insert policy: allow any authenticated staff/admin to insert into private_inbox depts
DROP POLICY IF EXISTS "Staff and admin can insert cases" ON public.cases;
CREATE POLICY "Staff and admin can insert cases" ON public.cases FOR INSERT
WITH CHECK (
  (public.check_is_admin() OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_private_inbox_dept(department_id)
    OR can_write_dept(department_id)
    OR project_id IS NOT NULL
  )
);
