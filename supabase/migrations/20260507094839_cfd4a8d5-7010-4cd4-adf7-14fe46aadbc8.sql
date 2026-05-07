-- 1) Add owner_id to departments
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- 2) Helper: SECURITY DEFINER lookup of department owner
CREATE OR REPLACE FUNCTION public.dept_owner(p_dept_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM public.departments WHERE id = p_dept_id
$$;

-- 3) Insert private departments (idempotent)
INSERT INTO public.departments (name, code, owner_id, sort_order, is_active)
SELECT 'CEO – Privat', 'CEO_PRIV', '3e60592f-f1df-4618-b9bf-db7d35dbdc29', 9001, true
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'CEO_PRIV');

INSERT INTO public.departments (name, code, owner_id, sort_order, is_active)
SELECT 'CTO – Privat', 'CTO_PRIV', '6da81b97-5ab7-4601-9130-8ebbb4a70e3e', 9002, true
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE code = 'CTO_PRIV');

-- 4) Departments SELECT policy: hide private depts from non-owners
DROP POLICY IF EXISTS "Authenticated can read departments" ON public.departments;
CREATE POLICY "Authenticated can read departments"
ON public.departments FOR SELECT TO authenticated
USING (
  owner_id IS NULL
  OR owner_id = auth.uid()
  OR public.check_is_admin()
);

-- 5) Cases SELECT policy: hide cases of private depts from non-owners
DROP POLICY IF EXISTS "Authenticated can read cases" ON public.cases;
CREATE POLICY "Authenticated can read cases"
ON public.cases FOR SELECT TO authenticated
USING (
  department_id IS NULL
  OR public.dept_owner(department_id) IS NULL
  OR public.dept_owner(department_id) = auth.uid()
  OR public.check_is_admin()
);

-- Cases UPDATE: also restrict in private depts
DROP POLICY IF EXISTS "Assignee, staff or admin can update cases" ON public.cases;
CREATE POLICY "Assignee, staff or admin can update cases"
ON public.cases FOR UPDATE TO authenticated
USING (
  (
    public.check_is_admin()
    OR (assignee_id = auth.uid())
    OR (assignee_id IS NULL AND has_role(auth.uid(), 'staff'::app_role))
  )
  AND (
    department_id IS NULL
    OR public.dept_owner(department_id) IS NULL
    OR public.dept_owner(department_id) = auth.uid()
    OR public.check_is_admin()
  )
);

-- Cases INSERT: prevent creating in someone else's private dept
DROP POLICY IF EXISTS "Staff and admin can insert cases" ON public.cases;
CREATE POLICY "Staff and admin can insert cases"
ON public.cases FOR INSERT TO authenticated
WITH CHECK (
  (public.check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND (
    department_id IS NULL
    OR public.dept_owner(department_id) IS NULL
    OR public.dept_owner(department_id) = auth.uid()
    OR public.check_is_admin()
  )
);

-- 6) case_tasks SELECT/INSERT/UPDATE/DELETE: derive from parent case dept
CREATE OR REPLACE FUNCTION public.case_dept_owner(p_case_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.dept_owner(c.department_id) FROM public.cases c WHERE c.id = p_case_id
$$;

DROP POLICY IF EXISTS "Authenticated can read case tasks" ON public.case_tasks;
CREATE POLICY "Authenticated can read case tasks"
ON public.case_tasks FOR SELECT TO authenticated
USING (
  public.case_dept_owner(case_id) IS NULL
  OR public.case_dept_owner(case_id) = auth.uid()
  OR public.check_is_admin()
);

DROP POLICY IF EXISTS "Staff and admin can insert case tasks" ON public.case_tasks;
CREATE POLICY "Staff and admin can insert case tasks"
ON public.case_tasks FOR INSERT TO authenticated
WITH CHECK (
  (public.check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.case_dept_owner(case_id) IS NULL
    OR public.case_dept_owner(case_id) = auth.uid()
    OR public.check_is_admin()
  )
);

DROP POLICY IF EXISTS "Staff and admin can update case tasks" ON public.case_tasks;
CREATE POLICY "Staff and admin can update case tasks"
ON public.case_tasks FOR UPDATE TO authenticated
USING (
  (public.check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.case_dept_owner(case_id) IS NULL
    OR public.case_dept_owner(case_id) = auth.uid()
    OR public.check_is_admin()
  )
);

-- 7) case_activity SELECT: same filter
DROP POLICY IF EXISTS "Authenticated can read activity" ON public.case_activity;
CREATE POLICY "Authenticated can read activity"
ON public.case_activity FOR SELECT TO authenticated
USING (
  public.case_dept_owner(case_id) IS NULL
  OR public.case_dept_owner(case_id) = auth.uid()
  OR public.check_is_admin()
);