
CREATE POLICY ghv_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ghv-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid())));
CREATE POLICY ghv_storage_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ghv-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid())));
CREATE POLICY ghv_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ghv-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid())))
  WITH CHECK (bucket_id = 'ghv-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid())));
CREATE POLICY ghv_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ghv-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid())));
