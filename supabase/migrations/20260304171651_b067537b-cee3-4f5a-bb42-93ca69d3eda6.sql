-- Create case-attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('case-attachments', 'case-attachments', false);

-- RLS for case-attachments: authenticated users can upload
CREATE POLICY "Authenticated can upload case attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'case-attachments');

-- Authenticated can read case attachments
CREATE POLICY "Authenticated can read case attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'case-attachments');

-- Admin or staff can delete case attachments
CREATE POLICY "Admin or staff can delete case attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'case-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));
