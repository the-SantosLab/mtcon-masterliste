
CREATE TABLE IF NOT EXISTS public.crm_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.crm_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage crm_access" ON public.crm_access
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users see own crm_access" ON public.crm_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_crm_access(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.crm_access
      WHERE user_id = uid AND is_active = true
    );
$$;
