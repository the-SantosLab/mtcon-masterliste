CREATE POLICY "erp templates read internal" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'erp-templates' AND public.is_internal_user());

CREATE POLICY "erp templates insert admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'erp-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "erp templates update admin" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'erp-templates' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'erp-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "erp templates delete admin" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'erp-templates' AND public.has_role(auth.uid(), 'admin'));