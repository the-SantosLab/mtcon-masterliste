CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(email::text) FROM auth.users WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_user_email() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, service_role;

DROP POLICY IF EXISTS "inbox_docs read own or admin" ON public.inbox_documents;
CREATE POLICY "inbox_docs read own or admin" ON public.inbox_documents
  FOR SELECT TO authenticated
  USING (
    public.check_is_admin(auth.uid())
    OR created_by = auth.uid()
    OR (from_email IS NOT NULL AND lower(from_email) = public.current_user_email())
  );