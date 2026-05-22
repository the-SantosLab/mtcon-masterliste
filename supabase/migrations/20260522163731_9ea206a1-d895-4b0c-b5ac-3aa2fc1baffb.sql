
CREATE TABLE public.case_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX idx_case_chat_messages_case ON public.case_chat_messages(case_id, created_at);

ALTER TABLE public.case_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read chat if can read case dept"
  ON public.case_chat_messages FOR SELECT TO authenticated
  USING (can_read_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can insert chat"
  ON public.case_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
    AND can_write_dept(case_department(case_id))
    AND author_id = auth.uid()
  );

CREATE POLICY "Author or admin can update chat"
  ON public.case_chat_messages FOR UPDATE TO authenticated
  USING (check_is_admin() OR author_id = auth.uid())
  WITH CHECK (check_is_admin() OR author_id = auth.uid());

CREATE POLICY "Author or admin can delete chat"
  ON public.case_chat_messages FOR DELETE TO authenticated
  USING (check_is_admin() OR author_id = auth.uid());

CREATE TABLE public.case_chat_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.case_chat_messages(id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_case_chat_attachments_msg ON public.case_chat_attachments(message_id);

ALTER TABLE public.case_chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read chat attachments if can read case dept"
  ON public.case_chat_attachments FOR SELECT TO authenticated
  USING (can_read_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can insert chat attachments"
  ON public.case_chat_attachments FOR INSERT TO authenticated
  WITH CHECK (
    (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
    AND can_write_dept(case_department(case_id))
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Uploader or admin can delete chat attachments"
  ON public.case_chat_attachments FOR DELETE TO authenticated
  USING (check_is_admin() OR uploaded_by = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.case_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_chat_attachments;
ALTER TABLE public.case_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.case_chat_attachments REPLICA IDENTITY FULL;
