DROP POLICY IF EXISTS "Admin and staff delete emails" ON public.case_emails;
CREATE POLICY "Admin and staff delete emails"
ON public.case_emails
FOR DELETE
TO authenticated
USING ((check_is_admin() OR has_role(auth.uid(), 'staff'::app_role)) AND can_write_dept(case_department(case_id)));

DROP POLICY IF EXISTS "Admin and staff delete email attachments" ON public.case_email_attachments;
CREATE POLICY "Admin and staff delete email attachments"
ON public.case_email_attachments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.case_emails e
    WHERE e.id = case_email_attachments.email_id
      AND (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
      AND can_write_dept(case_department(e.case_id))
  )
);