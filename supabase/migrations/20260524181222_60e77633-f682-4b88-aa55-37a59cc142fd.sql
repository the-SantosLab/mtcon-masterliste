-- Helper: resolve auth.users.id by email (case-insensitive)
CREATE OR REPLACE FUNCTION public.user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- Tighten RLS on mtiq_drafts
DROP POLICY IF EXISTS "Staff can read mtiq_drafts" ON public.mtiq_drafts;
DROP POLICY IF EXISTS "Staff can update mtiq_drafts" ON public.mtiq_drafts;

CREATE POLICY "Own or admin can read mtiq_drafts"
  ON public.mtiq_drafts FOR SELECT
  TO authenticated
  USING (check_is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "Own or admin can update mtiq_drafts"
  ON public.mtiq_drafts FOR UPDATE
  TO authenticated
  USING (check_is_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (check_is_admin(auth.uid()) OR created_by = auth.uid());