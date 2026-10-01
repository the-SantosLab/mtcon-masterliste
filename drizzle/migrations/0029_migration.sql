DROP POLICY IF EXISTS "exec service insert" ON public.action_executions;
CREATE POLICY "exec service insert" ON public.action_executions FOR INSERT TO authenticated WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "corrections insert authenticated" ON public.inbox_corrections;
CREATE POLICY "corrections insert authenticated" ON public.inbox_corrections FOR INSERT TO authenticated WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "issos_documents_read" ON public.issos_documents;
CREATE POLICY "issos_documents_read" ON public.issos_documents FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS "Authenticated can read project activity" ON public.project_activity;
CREATE POLICY "Authenticated can read project activity" ON public.project_activity FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS "freeze_closed_cases_update" ON public.cases;
CREATE POLICY "freeze_closed_cases_update" ON public.cases AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (check_is_admin(auth.uid()) OR (status <> ALL (ARRAY['abgeschlossen'::case_status,'verworfen'::case_status,'archiv'::case_status])))
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth read drawings bucket" ON storage.objects;
CREATE POLICY "auth read drawings bucket" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'drawings' AND public.is_internal_user());
DROP POLICY IF EXISTS "auth upload drawings bucket" ON storage.objects;
CREATE POLICY "auth upload drawings bucket" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'drawings' AND public.is_internal_user());
DROP POLICY IF EXISTS "auth update drawings bucket" ON storage.objects;
CREATE POLICY "auth update drawings bucket" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'drawings' AND public.is_internal_user()) WITH CHECK (bucket_id = 'drawings' AND public.is_internal_user());

DROP POLICY IF EXISTS "inbox-docs read authenticated" ON storage.objects;
CREATE POLICY "inbox-docs read authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'inbox-documents' AND public.is_internal_user());
DROP POLICY IF EXISTS "inbox-docs insert authenticated" ON storage.objects;
CREATE POLICY "inbox-docs insert authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'inbox-documents' AND public.is_internal_user());

DROP POLICY IF EXISTS "issos_bucket_read" ON storage.objects;
CREATE POLICY "issos_bucket_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'issos-documents' AND (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()) OR public.is_internal_user()));

DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
CREATE POLICY "Avatars publicly readable" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND public.is_internal_user());