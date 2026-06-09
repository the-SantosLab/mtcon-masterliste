-- Erweiterte Insert-Policy für case_notes
DROP POLICY IF EXISTS "Staff and admin can insert notes" ON public.case_notes;

CREATE POLICY "Staff and admin can insert notes"
ON public.case_notes
FOR INSERT
TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND author_id = auth.uid()
  AND (
    can_write_dept(case_department(case_id))
    OR EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_id
        AND (
          c.assignee_id = auth.uid()
          OR c.created_by = auth.uid()
          OR auth.uid() = ANY(COALESCE(c.watchers, ARRAY[]::uuid[]))
        )
    )
  )
);

-- Anhänge analog erweitern
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'case_note_attachments' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.case_note_attachments', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY "Staff and admin can insert note attachments"
ON public.case_note_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND uploaded_by = auth.uid()
  AND (
    can_write_dept(case_department(case_id))
    OR EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_id
        AND (
          c.assignee_id = auth.uid()
          OR c.created_by = auth.uid()
          OR auth.uid() = ANY(COALESCE(c.watchers, ARRAY[]::uuid[]))
        )
    )
  )
);