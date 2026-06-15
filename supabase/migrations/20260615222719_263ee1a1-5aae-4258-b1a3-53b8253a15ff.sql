-- Restrict deleting case emails to Admin/Staff with write access to the case's department
CREATE POLICY "Admin and staff delete emails"
ON public.case_emails
AS RESTRICTIVE
FOR DELETE
USING (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND can_write_dept(case_department(case_id))
);