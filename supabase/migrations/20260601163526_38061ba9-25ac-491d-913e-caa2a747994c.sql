-- 1) Table for draft attachments
CREATE TABLE public.mtiq_draft_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.mtiq_drafts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'email_attachment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mtiq_draft_attachments_draft ON public.mtiq_draft_attachments(draft_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mtiq_draft_attachments TO authenticated;
GRANT ALL ON public.mtiq_draft_attachments TO service_role;

ALTER TABLE public.mtiq_draft_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin can read draft attachments"
ON public.mtiq_draft_attachments
FOR SELECT
TO authenticated
USING (
  check_is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.mtiq_drafts d
    WHERE d.id = mtiq_draft_attachments.draft_id
      AND d.created_by = auth.uid()
  )
);

CREATE POLICY "Owner or admin can delete draft attachments"
ON public.mtiq_draft_attachments
FOR DELETE
TO authenticated
USING (
  check_is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.mtiq_drafts d
    WHERE d.id = mtiq_draft_attachments.draft_id
      AND d.created_by = auth.uid()
  )
);

-- inserts are done by service_role (intake) and approve flow; no authenticated insert policy needed.

-- 2) Storage bucket for draft attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mtiq-draft-attachments', 'mtiq-draft-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Read policy: owner of the draft or admin (path begins with '<draft_id>/...')
CREATE POLICY "Owner or admin can read mtiq draft files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'mtiq-draft-attachments'
  AND (
    check_is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mtiq_drafts d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.created_by = auth.uid()
    )
  )
);
