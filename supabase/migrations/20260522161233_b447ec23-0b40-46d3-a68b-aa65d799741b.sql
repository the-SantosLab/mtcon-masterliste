CREATE TABLE public.case_note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.case_notes(id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_note_attachments_note ON public.case_note_attachments(note_id);
CREATE INDEX idx_case_note_attachments_case ON public.case_note_attachments(case_id);

ALTER TABLE public.case_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read note attachments if can read case dept"
  ON public.case_note_attachments FOR SELECT
  TO authenticated
  USING (can_read_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can insert note attachments"
  ON public.case_note_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
    AND can_write_dept(case_department(case_id))
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Uploader or admin can delete note attachments"
  ON public.case_note_attachments FOR DELETE
  TO authenticated
  USING (check_is_admin() OR uploaded_by = auth.uid());