-- Erweitere Lesezugriff auf Vorgänge: Bearbeiter, Watcher und Unteraufgaben-Verantwortliche
-- können den Vorgang sehen, auch wenn sie keine Abteilungs-Berechtigung haben.

CREATE OR REPLACE FUNCTION public.can_read_case(p_case_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = p_case_id
      AND (
        public.can_read_dept(c.department_id, p_uid)
        OR c.assignee_id = p_uid
        OR p_uid = ANY(COALESCE(c.watchers, ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1 FROM public.case_tasks t
          WHERE t.case_id = c.id AND t.assigned_to = p_uid
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Authenticated can read cases" ON public.cases;
CREATE POLICY "Authenticated can read cases"
ON public.cases
FOR SELECT
TO authenticated
USING (
  public.can_read_dept(department_id)
  OR assignee_id = auth.uid()
  OR auth.uid() = ANY(COALESCE(watchers, ARRAY[]::uuid[]))
  OR EXISTS (
    SELECT 1 FROM public.case_tasks t
    WHERE t.case_id = cases.id AND t.assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated can read case tasks" ON public.case_tasks;
CREATE POLICY "Authenticated can read case tasks"
ON public.case_tasks
FOR SELECT
TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.can_read_case(case_id)
);
