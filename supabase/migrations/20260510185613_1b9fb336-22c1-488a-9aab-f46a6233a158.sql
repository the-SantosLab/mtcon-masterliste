
CREATE TABLE public.case_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  note_id uuid REFERENCES public.case_notes(id) ON DELETE SET NULL,
  message_id text,
  from_email text NOT NULL,
  from_name text,
  to_email text,
  subject text,
  body_plain text,
  body_html text,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_emails_case_id_idx ON public.case_emails(case_id, received_at DESC);
CREATE UNIQUE INDEX case_emails_message_id_uniq ON public.case_emails(message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.case_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read emails if can read case dept" ON public.case_emails
  FOR SELECT TO authenticated
  USING (can_read_dept(case_department(case_id)));

-- Inserts only via service role (no policy = denied for authenticated)

CREATE TABLE public.case_email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.case_emails(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_email_attachments_email_idx ON public.case_email_attachments(email_id);
CREATE INDEX case_email_attachments_case_idx ON public.case_email_attachments(case_id);

ALTER TABLE public.case_email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read email attachments if can read case dept" ON public.case_email_attachments
  FOR SELECT TO authenticated
  USING (can_read_dept(case_department(case_id)));

-- Enable realtime so the inbox updates live in the case detail view
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_emails;
