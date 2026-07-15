-- BUG-2026-0134: Align insurance-documents storage policies with category-based permissions
-- The pre-existing policies restricted uploads to admins only, blocking staff users
-- who legitimately have write access via document_category_permissions.

DROP POLICY IF EXISTS ins_storage_read_admin_manager ON storage.objects;
DROP POLICY IF EXISTS ins_storage_write_admin ON storage.objects;
DROP POLICY IF EXISTS ins_storage_update_admin ON storage.objects;
DROP POLICY IF EXISTS ins_storage_delete_admin ON storage.objects;

-- Path layout is `<policy_id>/<uuid>.<ext>`, so the first folder segment is the policy id.
CREATE POLICY ins_storage_read
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'insurance-documents'
    AND (
      check_is_admin(auth.uid())
      OR public.can_read_doc_category(
        public.policy_category(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY ins_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'insurance-documents'
    AND (
      check_is_admin(auth.uid())
      OR public.can_write_doc_category(
        public.policy_category(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY ins_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'insurance-documents'
    AND (
      check_is_admin(auth.uid())
      OR public.can_write_doc_category(
        public.policy_category(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'insurance-documents'
    AND (
      check_is_admin(auth.uid())
      OR public.can_write_doc_category(
        public.policy_category(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY ins_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'insurance-documents'
    AND (
      check_is_admin(auth.uid())
      OR public.can_write_doc_category(
        public.policy_category(((storage.foldername(name))[1])::uuid)
      )
    )
  );