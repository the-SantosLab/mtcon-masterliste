CREATE TABLE public.erp_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_access TO authenticated;
GRANT ALL ON public.erp_access TO service_role;
ALTER TABLE public.erp_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_access_self_read" ON public.erp_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "erp_access_admin_write" ON public.erp_access FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.has_erp_access(uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.erp_access WHERE user_id = uid AND is_active = true
  );
$$;