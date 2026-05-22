-- 1. Extend case_chat_messages with reply, pin
ALTER TABLE public.case_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.case_chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid,
  ADD COLUMN IF NOT EXISTS system_kind text,
  ADD COLUMN IF NOT EXISTS system_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_chat_messages_case_created ON public.case_chat_messages(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply ON public.case_chat_messages(reply_to_id);

-- 2. Reactions
CREATE TABLE IF NOT EXISTS public.case_chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.case_chat_messages(id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.case_chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read reactions if can read case dept" ON public.case_chat_reactions
  FOR SELECT TO authenticated USING (can_read_dept(case_department(case_id)));
CREATE POLICY "Authenticated can add own reaction" ON public.case_chat_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND can_read_dept(case_department(case_id)));
CREATE POLICY "Own reaction delete" ON public.case_chat_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR check_is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.case_chat_reactions;

-- 3. Read receipts (last_read_at per user per case)
CREATE TABLE IF NOT EXISTS public.case_chat_reads (
  case_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);
ALTER TABLE public.case_chat_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reads select" ON public.case_chat_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own reads upsert insert" ON public.case_chat_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own reads update" ON public.case_chat_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Mutes
CREATE TABLE IF NOT EXISTS public.case_chat_mutes (
  case_id uuid NOT NULL,
  user_id uuid NOT NULL,
  muted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);
ALTER TABLE public.case_chat_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own mutes all" ON public.case_chat_mutes
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Allow system chat messages to be inserted by triggers (system_kind set)
-- Update existing insert policy to allow author_id=auth.uid() OR system_kind set by trigger (SECURITY DEFINER)
-- Keep existing policy as-is; system inserts will run via SECURITY DEFINER triggers.

-- 6. Trigger: emit system chat message on case status / department change
CREATE OR REPLACE FUNCTION public.emit_case_system_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.case_chat_messages (case_id, author_id, body, system_kind, system_payload)
      VALUES (NEW.id, COALESCE(v_actor, NEW.assignee_id, NEW.created_by),
        'Status: ' || OLD.status::text || ' → ' || NEW.status::text,
        'status_change',
        jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text, 'actor', v_actor));
    END IF;
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
      INSERT INTO public.case_chat_messages (case_id, author_id, body, system_kind, system_payload)
      VALUES (NEW.id, COALESCE(v_actor, NEW.assignee_id, NEW.created_by),
        'Abteilung gewechselt',
        'department_change',
        jsonb_build_object('from', OLD.department_id, 'to', NEW.department_id, 'actor', v_actor));
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.case_chat_messages (case_id, author_id, body, system_kind, system_payload)
      VALUES (NEW.id, COALESCE(v_actor, NEW.assignee_id, NEW.created_by),
        'Zuweisung geändert',
        'assignee_change',
        jsonb_build_object('from', OLD.assignee_id, 'to', NEW.assignee_id, 'actor', v_actor));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_case_system_chat ON public.cases;
CREATE TRIGGER trg_emit_case_system_chat
  AFTER UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.emit_case_system_chat();

-- Adjust insert policy on case_chat_messages to permit system rows (author_id may be any case-related user)
DROP POLICY IF EXISTS "Staff and admin can insert chat" ON public.case_chat_messages;
CREATE POLICY "Insert chat (user or system)" ON public.case_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (system_kind IS NOT NULL) -- system rows via SECURITY DEFINER trigger
    OR ((check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
        AND can_write_dept(case_department(case_id))
        AND author_id = auth.uid())
  );