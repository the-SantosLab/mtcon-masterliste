
CREATE OR REPLACE FUNCTION public.notify_chat_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_body text;
  v_case_no text;
  v_reactor_name text;
  v_preview text;
BEGIN
  SELECT author_id, body INTO v_author, v_body
  FROM public.case_chat_messages
  WHERE id = NEW.message_id AND deleted_at IS NULL;

  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(case_no, case_number::text, project_name, 'Vorgang') INTO v_case_no
  FROM public.cases WHERE id = NEW.case_id;

  SELECT COALESCE(display_name, short_code, 'Jemand') INTO v_reactor_name
  FROM public.users_profile WHERE id = NEW.user_id;

  v_preview := CASE
    WHEN v_body IS NULL OR length(trim(v_body)) = 0 THEN ''
    WHEN length(v_body) > 60 THEN '„' || substring(v_body for 60) || '…"'
    ELSE '„' || v_body || '"'
  END;

  INSERT INTO public.notifications (user_id, type, title, body, href)
  VALUES (
    v_author,
    'chat_reaction',
    v_reactor_name || ' hat mit ' || NEW.emoji || ' reagiert',
    COALESCE(NULLIF(v_case_no, '') || ' · ', '') || v_preview,
    '/cases/' || NEW.case_id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_reaction ON public.case_chat_reactions;
CREATE TRIGGER trg_notify_chat_reaction
AFTER INSERT ON public.case_chat_reactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_chat_reaction();
