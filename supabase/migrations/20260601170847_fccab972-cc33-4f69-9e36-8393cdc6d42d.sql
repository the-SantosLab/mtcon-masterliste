-- 1) Table for APS-Delta / ISSOS documents
CREATE TABLE public.issos_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intake_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_email_from text,
  source_email_subject text,
  source_email_message_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  sender_hint text,
  snapshot_date date,
  document_type text,
  summary text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT issos_documents_status_chk CHECK (status IN ('new','reviewed','archived'))
);

CREATE INDEX idx_issos_documents_intake ON public.issos_documents(intake_id);
CREATE INDEX idx_issos_documents_received_at ON public.issos_documents(received_at DESC);
CREATE INDEX idx_issos_documents_status ON public.issos_documents(status);
CREATE INDEX idx_issos_documents_tags ON public.issos_documents USING GIN(tags);

-- 2) Grants (auth-only; service role for edge functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issos_documents TO authenticated;
GRANT ALL ON public.issos_documents TO service_role;

-- 3) RLS
ALTER TABLE public.issos_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issos_documents_read"
  ON public.issos_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "issos_documents_insert"
  ON public.issos_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()));

CREATE POLICY "issos_documents_update"
  ON public.issos_documents
  FOR UPDATE
  TO authenticated
  USING (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()));

CREATE POLICY "issos_documents_delete"
  ON public.issos_documents
  FOR DELETE
  TO authenticated
  USING (public.check_is_admin(auth.uid()));

-- 4) updated_at trigger
CREATE TRIGGER trg_issos_documents_updated_at
  BEFORE UPDATE ON public.issos_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('issos-documents', 'issos-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 6) Storage policies for the bucket
CREATE POLICY "issos_bucket_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'issos-documents');

CREATE POLICY "issos_bucket_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'issos-documents'
    AND (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()))
  );

CREATE POLICY "issos_bucket_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'issos-documents'
    AND (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()))
  );

CREATE POLICY "issos_bucket_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'issos-documents'
    AND public.check_is_admin(auth.uid())
  );
