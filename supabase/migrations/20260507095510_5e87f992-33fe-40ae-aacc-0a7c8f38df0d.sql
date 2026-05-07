
-- Helper: does the department have any permission matrix rows?
CREATE OR REPLACE FUNCTION public.dept_has_matrix(p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_permissions
    WHERE department_id = p_dept_id AND permission <> 'none'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dept_read(p_uid uuid, p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_permissions
    WHERE user_id = p_uid AND department_id = p_dept_id
      AND permission IN ('read','write')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dept_write(p_uid uuid, p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_permissions
    WHERE user_id = p_uid AND department_id = p_dept_id
      AND permission = 'write'
  );
$$;

-- Helper: department of a given case
CREATE OR REPLACE FUNCTION public.case_department(p_case_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT department_id FROM public.cases WHERE id = p_case_id;
$$;

-- Combined access helpers (read / write) at the cases level
CREATE OR REPLACE FUNCTION public.can_read_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR (
      (dept_owner(p_dept_id) IS NULL)
      AND (NOT dept_has_matrix(p_dept_id) OR has_dept_read(p_uid, p_dept_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR (
      (dept_owner(p_dept_id) IS NULL)
      AND (NOT dept_has_matrix(p_dept_id) OR has_dept_write(p_uid, p_dept_id))
    );
$$;

-- ============================================================
-- Replace policies on CASES
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read cases" ON public.cases;
DROP POLICY IF EXISTS "Assignee, staff or admin can update cases" ON public.cases;
DROP POLICY IF EXISTS "Staff and admin can insert cases" ON public.cases;

CREATE POLICY "Authenticated can read cases"
ON public.cases
FOR SELECT
TO authenticated
USING (public.can_read_dept(department_id));

CREATE POLICY "Assignee, staff or admin can update cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  (
    check_is_admin()
    OR assignee_id = auth.uid()
    OR (assignee_id IS NULL AND has_role(auth.uid(),'staff'::app_role))
  )
  AND public.can_write_dept(department_id)
);

CREATE POLICY "Staff and admin can insert cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(),'staff'::app_role))
  AND public.can_write_dept(department_id)
);

-- ============================================================
-- Replace policies on CASE_TASKS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Staff and admin can insert case tasks" ON public.case_tasks;
DROP POLICY IF EXISTS "Staff and admin can update case tasks" ON public.case_tasks;

CREATE POLICY "Authenticated can read case tasks"
ON public.case_tasks
FOR SELECT
TO authenticated
USING (public.can_read_dept(public.case_department(case_id)));

CREATE POLICY "Staff and admin can insert case tasks"
ON public.case_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(),'staff'::app_role))
  AND public.can_write_dept(public.case_department(case_id))
);

CREATE POLICY "Staff and admin can update case tasks"
ON public.case_tasks
FOR UPDATE
TO authenticated
USING (
  (check_is_admin() OR has_role(auth.uid(),'staff'::app_role))
  AND public.can_write_dept(public.case_department(case_id))
);

-- ============================================================
-- Replace SELECT policy on CASE_ACTIVITY
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read activity" ON public.case_activity;

CREATE POLICY "Authenticated can read activity"
ON public.case_activity
FOR SELECT
TO authenticated
USING (public.can_read_dept(public.case_department(case_id)));
