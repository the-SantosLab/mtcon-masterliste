
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS watcher_departments uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.is_case_watcher(p_case_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = p_case_id
      AND (
        p_uid = ANY(COALESCE(c.watchers, ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(c.watcher_departments, ARRAY[]::uuid[])) d(dept_id)
          WHERE public.has_dept_read(p_uid, d.dept_id)
             OR public.dept_owner(d.dept_id) = p_uid
        )
      )
  );
$function$;

DROP POLICY IF EXISTS "Read notes if can read case dept" ON public.case_notes;
CREATE POLICY "Read notes if can read case dept or watcher"
ON public.case_notes
FOR SELECT
USING (
  public.can_read_dept(public.case_department(case_id))
  OR public.is_case_watcher(case_id, auth.uid())
);
