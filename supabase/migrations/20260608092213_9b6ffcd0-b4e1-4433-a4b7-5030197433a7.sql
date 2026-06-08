
CREATE POLICY "Admins read article-imports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'article-imports' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins upload article-imports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-imports' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete article-imports" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'article-imports' AND public.has_role(auth.uid(), 'admin'::app_role));
