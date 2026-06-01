DROP POLICY IF EXISTS "inbox_docs read authenticated" ON public.inbox_documents;

CREATE POLICY "inbox_docs read own or admin"
ON public.inbox_documents
FOR SELECT
TO authenticated
USING (
  check_is_admin(auth.uid())
  OR created_by = auth.uid()
  OR (
    from_email IS NOT NULL
    AND lower(from_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
);