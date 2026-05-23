
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vorgang_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_user_vorgang_created ON public.ai_messages(user_id, vorgang_id, created_at DESC);
CREATE INDEX idx_ai_messages_user_unread ON public.ai_messages(user_id) WHERE read_at IS NULL AND role = 'assistant';

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_messages_select_own"
  ON public.ai_messages FOR SELECT
  USING (user_id = auth.uid() AND public.can_read_dept(public.case_department(vorgang_id)));

CREATE POLICY "ai_messages_insert_own"
  ON public.ai_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.can_read_dept(public.case_department(vorgang_id)));

CREATE POLICY "ai_messages_update_own"
  ON public.ai_messages FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_messages_delete_own"
  ON public.ai_messages FOR DELETE
  USING (user_id = auth.uid());

ALTER TABLE public.ai_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_messages;

CREATE OR REPLACE FUNCTION public.mark_ai_messages_read(p_vorgang_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.ai_messages
       SET read_at = now()
     WHERE user_id = auth.uid()
       AND vorgang_id = p_vorgang_id
       AND role = 'assistant'
       AND read_at IS NULL
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
