-- Schnellere Berechnung ungelesener Vorgangs-Chats.
CREATE OR REPLACE FUNCTION public.get_case_chat_unread(p_case_ids uuid[])
 RETURNS TABLE(case_id uuid, unread_count integer, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  ids AS (
    SELECT DISTINCT m.case_id AS id
    FROM public.case_chat_messages m
    WHERE m.case_id = ANY(p_case_ids) AND m.deleted_at IS NULL
  ),
  candidates AS (
    SELECT i.id, r.last_read_at
    FROM ids i
    LEFT JOIN public.case_chat_reads r
      ON r.case_id = i.id AND r.user_id = (SELECT uid FROM me)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.case_chat_mutes mu
      WHERE mu.user_id = (SELECT uid FROM me) AND mu.case_id = i.id
    )
  )
  SELECT c.id AS case_id, COALESCE(a.cnt, 0) AS unread_count, a.last_at AS last_message_at
  FROM candidates c
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (
             WHERE m.author_id <> (SELECT uid FROM me)
               AND m.created_at > COALESCE(c.last_read_at, 'epoch'::timestamptz)
           )::int AS cnt,
           max(m.created_at) AS last_at
    FROM public.case_chat_messages m
    WHERE m.case_id = c.id AND m.deleted_at IS NULL
  ) a ON TRUE
  WHERE public.can_access_case_chat(c.id);
$function$;

-- Gesamtzahl ungelesener Chat-Nachrichten für die Seitenleiste (ohne Vorab-Liste aller Vorgänge).
CREATE OR REPLACE FUNCTION public.get_case_chat_unread_total()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  candidates AS (
    SELECT m.case_id AS id, count(*)::int AS cnt
    FROM public.case_chat_messages m
    LEFT JOIN public.case_chat_reads r
      ON r.case_id = m.case_id AND r.user_id = (SELECT uid FROM me)
    WHERE m.deleted_at IS NULL
      AND m.author_id <> (SELECT uid FROM me)
      AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
      AND NOT EXISTS (
        SELECT 1 FROM public.case_chat_mutes mu
        WHERE mu.user_id = (SELECT uid FROM me) AND mu.case_id = m.case_id
      )
    GROUP BY m.case_id
  )
  SELECT COALESCE(sum(c.cnt), 0)::int
  FROM candidates c
  JOIN public.cases cs ON cs.id = c.id AND cs.deleted = false
  WHERE public.can_access_case_chat(c.id);
$function$;

GRANT EXECUTE ON FUNCTION public.get_case_chat_unread_total() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_chat_messages_active_case_created
  ON public.case_chat_messages (case_id, created_at)
  WHERE deleted_at IS NULL;