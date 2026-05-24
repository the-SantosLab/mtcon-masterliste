-- Helper: is current user a watcher of the case?
CREATE OR REPLACE FUNCTION public.is_case_watcher(p_case_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = p_case_id
      AND p_uid = ANY(COALESCE(c.watchers, ARRAY[]::uuid[]))
  );
$$;

-- Combined access helper for chat
CREATE OR REPLACE FUNCTION public.can_access_case_chat(p_case_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    can_read_dept(case_department(p_case_id), p_uid)
    OR is_case_watcher(p_case_id, p_uid);
$$;

-- case_chat_messages
DROP POLICY IF EXISTS "Read chat if can read case dept" ON public.case_chat_messages;
CREATE POLICY "Read chat if dept or watcher"
ON public.case_chat_messages FOR SELECT
USING (can_access_case_chat(case_id));

DROP POLICY IF EXISTS "Insert chat (user or system)" ON public.case_chat_messages;
CREATE POLICY "Insert chat (user or system)"
ON public.case_chat_messages FOR INSERT
WITH CHECK (
  system_kind IS NOT NULL
  OR (
    (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role) OR is_case_watcher(case_id))
    AND (can_write_dept(case_department(case_id)) OR is_case_watcher(case_id))
    AND author_id = auth.uid()
  )
);

-- case_chat_attachments
DROP POLICY IF EXISTS "Read chat attachments if can read case dept" ON public.case_chat_attachments;
CREATE POLICY "Read chat attachments if dept or watcher"
ON public.case_chat_attachments FOR SELECT
USING (can_access_case_chat(case_id));

DROP POLICY IF EXISTS "Staff and admin can insert chat attachments" ON public.case_chat_attachments;
CREATE POLICY "Insert chat attachments (staff or watcher)"
ON public.case_chat_attachments FOR INSERT
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role) OR is_case_watcher(case_id))
  AND (can_write_dept(case_department(case_id)) OR is_case_watcher(case_id))
  AND uploaded_by = auth.uid()
);

-- case_chat_reactions
DROP POLICY IF EXISTS "Read reactions if can read case dept" ON public.case_chat_reactions;
CREATE POLICY "Read reactions if dept or watcher"
ON public.case_chat_reactions FOR SELECT
USING (can_access_case_chat(case_id));

DROP POLICY IF EXISTS "Authenticated can add own reaction" ON public.case_chat_reactions;
CREATE POLICY "Add own reaction if dept or watcher"
ON public.case_chat_reactions FOR INSERT
WITH CHECK (user_id = auth.uid() AND can_access_case_chat(case_id));

-- Unread counter: include watcher-accessible cases
CREATE OR REPLACE FUNCTION public.get_case_chat_unread(p_case_ids uuid[])
RETURNS TABLE(case_id uuid, unread_count integer, last_message_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ids AS (SELECT unnest(p_case_ids) AS id),
  reads AS (
    SELECT r.case_id, r.last_read_at FROM public.case_chat_reads r
    WHERE r.user_id = auth.uid() AND r.case_id = ANY(p_case_ids)
  ),
  muted AS (
    SELECT m.case_id FROM public.case_chat_mutes m
    WHERE m.user_id = auth.uid() AND m.case_id = ANY(p_case_ids)
  )
  SELECT
    ids.id AS case_id,
    COALESCE((
      SELECT count(*)::int FROM public.case_chat_messages m
      WHERE m.case_id = ids.id
        AND m.deleted_at IS NULL
        AND m.author_id <> auth.uid()
        AND m.created_at > COALESCE((SELECT last_read_at FROM reads WHERE reads.case_id = ids.id), 'epoch'::timestamptz)
    ), 0) AS unread_count,
    (SELECT max(m.created_at) FROM public.case_chat_messages m WHERE m.case_id = ids.id AND m.deleted_at IS NULL) AS last_message_at
  FROM ids
  WHERE NOT EXISTS (SELECT 1 FROM muted WHERE muted.case_id = ids.id)
    AND can_access_case_chat(ids.id);
$$;