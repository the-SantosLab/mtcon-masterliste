
-- Helper: is a case currently frozen?
CREATE OR REPLACE FUNCTION public.is_case_frozen(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = p_case_id
      AND status IN ('abgeschlossen','verworfen','archiv')
  );
$$;

-- ============ cases ============
DROP POLICY IF EXISTS "freeze_closed_cases_update" ON public.cases;
CREATE POLICY "freeze_closed_cases_update"
ON public.cases AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR status NOT IN ('abgeschlossen','verworfen','archiv')
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR status NOT IN ('abgeschlossen','verworfen','archiv')
);

DROP POLICY IF EXISTS "freeze_closed_cases_delete" ON public.cases;
CREATE POLICY "freeze_closed_cases_delete"
ON public.cases AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR status NOT IN ('abgeschlossen','verworfen','archiv')
);

-- ============ case_tasks ============
DROP POLICY IF EXISTS "freeze_closed_case_tasks_insert" ON public.case_tasks;
CREATE POLICY "freeze_closed_case_tasks_insert"
ON public.case_tasks AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_case_tasks_update" ON public.case_tasks;
CREATE POLICY "freeze_closed_case_tasks_update"
ON public.case_tasks AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_case_tasks_delete" ON public.case_tasks;
CREATE POLICY "freeze_closed_case_tasks_delete"
ON public.case_tasks AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

-- ============ case_notes ============
DROP POLICY IF EXISTS "freeze_closed_case_notes_insert" ON public.case_notes;
CREATE POLICY "freeze_closed_case_notes_insert"
ON public.case_notes AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_case_notes_update" ON public.case_notes;
CREATE POLICY "freeze_closed_case_notes_update"
ON public.case_notes AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_case_notes_delete" ON public.case_notes;
CREATE POLICY "freeze_closed_case_notes_delete"
ON public.case_notes AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

-- ============ case_chat_messages ============
DROP POLICY IF EXISTS "freeze_closed_chat_insert" ON public.case_chat_messages;
CREATE POLICY "freeze_closed_chat_insert"
ON public.case_chat_messages AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_chat_update" ON public.case_chat_messages;
CREATE POLICY "freeze_closed_chat_update"
ON public.case_chat_messages AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_chat_delete" ON public.case_chat_messages;
CREATE POLICY "freeze_closed_chat_delete"
ON public.case_chat_messages AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

-- ============ case_emails ============
DROP POLICY IF EXISTS "freeze_closed_emails_insert" ON public.case_emails;
CREATE POLICY "freeze_closed_emails_insert"
ON public.case_emails AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_emails_update" ON public.case_emails;
CREATE POLICY "freeze_closed_emails_update"
ON public.case_emails AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_emails_delete" ON public.case_emails;
CREATE POLICY "freeze_closed_emails_delete"
ON public.case_emails AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

-- ============ case_email_attachments ============
DROP POLICY IF EXISTS "freeze_closed_email_att_insert" ON public.case_email_attachments;
CREATE POLICY "freeze_closed_email_att_insert"
ON public.case_email_attachments AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_email_att_update" ON public.case_email_attachments;
CREATE POLICY "freeze_closed_email_att_update"
ON public.case_email_attachments AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
)
WITH CHECK (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);

DROP POLICY IF EXISTS "freeze_closed_email_att_delete" ON public.case_email_attachments;
CREATE POLICY "freeze_closed_email_att_delete"
ON public.case_email_attachments AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  public.check_is_admin(auth.uid())
  OR NOT public.is_case_frozen(case_id)
);
