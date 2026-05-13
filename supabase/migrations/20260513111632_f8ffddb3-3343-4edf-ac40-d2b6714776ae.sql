CREATE POLICY "Admin and staff delete email attachments"
ON public.case_email_attachments
FOR DELETE
TO authenticated
USING (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND can_write_dept(case_department(case_id))
);