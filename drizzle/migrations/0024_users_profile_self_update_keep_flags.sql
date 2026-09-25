CREATE OR REPLACE FUNCTION public.own_profile_is_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(p.is_manager, false) FROM public.users_profile p WHERE p.id = _uid $$;

DROP POLICY IF EXISTS "Users can update own profile" ON public.users_profile;
CREATE POLICY "Users can update own profile" ON public.users_profile
FOR UPDATE TO authenticated
USING ((id = auth.uid()) OR is_admin())
WITH CHECK (
  is_admin() OR (
    id = auth.uid()
    AND is_admin = false
    AND is_manager IS NOT DISTINCT FROM public.own_profile_is_manager(auth.uid())
  )
);