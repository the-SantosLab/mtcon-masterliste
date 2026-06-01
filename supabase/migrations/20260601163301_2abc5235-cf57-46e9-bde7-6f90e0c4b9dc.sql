DROP POLICY IF EXISTS "Authenticated users can view published announcements" ON public.announcements;

CREATE POLICY "Authenticated users can view published announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  published_at <= now()
  OR check_is_admin(auth.uid())
);