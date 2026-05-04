
-- 1) check_is_admin() relies only on user_roles (prevent self-elevation via is_admin flag)
CREATE OR REPLACE FUNCTION public.check_is_admin(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
  );
$function$;

-- 2) users_profile UPDATE: prevent self-escalation of is_admin / is_manager
DROP POLICY IF EXISTS "Users can update own profile" ON public.users_profile;
CREATE POLICY "Users can update own profile"
ON public.users_profile
FOR UPDATE
TO authenticated
USING ((id = auth.uid()) OR public.is_admin())
WITH CHECK (
  public.is_admin()
  OR (
    id = auth.uid()
    AND is_admin = false
    AND is_manager = false
  )
);

-- 3) user_roles SELECT: restrict to own role or staff/admin
DROP POLICY IF EXISTS "Authenticated can read roles" ON public.user_roles;
CREATE POLICY "Users read own role; staff and admin read all"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'staff'::app_role)
);

-- 4) cases UPDATE: remove "assignee_id IS NULL" loophole; require staff/admin for unassigned cases
DROP POLICY IF EXISTS "Assignee or admin can update cases" ON public.cases;
CREATE POLICY "Assignee, staff or admin can update cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR assignee_id = auth.uid()
  OR (assignee_id IS NULL AND public.has_role(auth.uid(), 'staff'::app_role))
);

-- 5) portal_customers: split ALL policy; restrict UPDATE/INSERT/DELETE
DROP POLICY IF EXISTS "Admin manages portal customers" ON public.portal_customers;

CREATE POLICY "Admin and staff insert portal customers"
ON public.portal_customers
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'staff'::app_role)
);

-- Staff may update non-sensitive fields; auth_user_id changes are admin-only.
CREATE POLICY "Staff updates portal customers (no auth_user_id changes)"
ON public.portal_customers
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'staff'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'staff'::app_role)
    AND auth_user_id IS NOT DISTINCT FROM (
      SELECT pc.auth_user_id FROM public.portal_customers pc WHERE pc.id = portal_customers.id
    )
  )
);

CREATE POLICY "Admin deletes portal customers"
ON public.portal_customers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6) Storage buckets: restrict to staff/admin (portal customers no longer have access)
DROP POLICY IF EXISTS "Authenticated can read case attachments" ON storage.objects;
CREATE POLICY "Staff and admin read case attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-attachments'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS "Authenticated can upload case attachments" ON storage.objects;
CREATE POLICY "Staff and admin upload case attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-attachments'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS "Authenticated users can read support attachments" ON storage.objects;
CREATE POLICY "Staff and admin read support attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS "Authenticated users can upload support attachments" ON storage.objects;
CREATE POLICY "Staff and admin upload support attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS "Authenticated can read project files" ON storage.objects;
CREATE POLICY "Staff and admin read project files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS "Authenticated can upload project files" ON storage.objects;
CREATE POLICY "Staff and admin upload project files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);
