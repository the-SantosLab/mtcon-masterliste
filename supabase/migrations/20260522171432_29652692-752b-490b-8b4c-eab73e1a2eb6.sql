CREATE OR REPLACE FUNCTION public.get_case_chat_unread(p_case_ids uuid[])
RETURNS TABLE (case_id uuid, unread_count integer, last_message_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    AND can_read_dept(case_department(ids.id));
$$;

REVOKE EXECUTE ON FUNCTION public.get_case_chat_unread(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_case_chat_unread(uuid[]) TO authenticated;