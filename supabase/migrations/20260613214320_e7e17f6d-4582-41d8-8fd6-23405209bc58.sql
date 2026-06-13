DROP POLICY IF EXISTS "Read emails if can read case dept" ON public.case_emails;
CREATE POLICY "Read emails if can read case"
  ON public.case_emails
  FOR SELECT
  TO authenticated
  USING (public.can_read_case(case_id));

DROP POLICY IF EXISTS "Read email attachments if can read case dept" ON public.case_email_attachments;
CREATE POLICY "Read email attachments if can read case"
  ON public.case_email_attachments
  FOR SELECT
  TO authenticated
  USING (public.can_read_case(case_id));