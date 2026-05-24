
-- Helper: dedupe recipients & exclude actor
-- We use plain triggers per table.

-- 1) New chat message
CREATE OR REPLACE FUNCTION public.notify_new_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_author_name text;
  v_preview text;
  v_case_no text;
  v_recipient uuid;
BEGIN
  IF NEW.system_kind IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT assignee_id, watchers, created_by, COALESCE(case_no, case_number::text, project_name, 'Vorgang') AS cno
    INTO v_case FROM public.cases WHERE id = NEW.case_id;
  v_case_no := v_case.cno;

  SELECT COALESCE(display_name, short_code, 'Jemand') INTO v_author_name
    FROM public.users_profile WHERE id = NEW.author_id;

  v_preview := CASE
    WHEN NEW.body IS NULL OR length(trim(NEW.body)) = 0 THEN '(Anhang)'
    WHEN length(NEW.body) > 80 THEN substring(NEW.body for 80) || '…'
    ELSE NEW.body
  END;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_case.assignee_id AS uid
      UNION SELECT v_case.created_by
      UNION SELECT unnest(COALESCE(v_case.watchers, ARRAY[]::uuid[]))
    ) s
    WHERE uid IS NOT NULL AND uid <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (v_recipient, 'chat_message',
      v_author_name || ' · ' || v_case_no,
      v_preview,
      '/cases/' || NEW.case_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.case_chat_messages;
CREATE TRIGGER trg_notify_new_chat_message
AFTER INSERT ON public.case_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_chat_message();

-- 2) New subtask
CREATE OR REPLACE FUNCTION public.notify_new_subtask()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_actor uuid := auth.uid();
  v_recipient uuid;
BEGIN
  SELECT assignee_id, watchers, created_by, COALESCE(case_no, case_number::text, project_name, 'Vorgang') AS cno
    INTO v_case FROM public.cases WHERE id = NEW.case_id;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_case.assignee_id AS uid
      UNION SELECT NEW.assigned_to
      UNION SELECT unnest(COALESCE(v_case.watchers, ARRAY[]::uuid[]))
    ) s
    WHERE uid IS NOT NULL AND uid <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (v_recipient, 'task_created',
      'Neue Unteraufgabe · ' || v_case.cno,
      NEW.title,
      '/cases/' || NEW.case_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_subtask ON public.case_tasks;
CREATE TRIGGER trg_notify_new_subtask
AFTER INSERT ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_new_subtask();

-- 3) Case assignment + status change
CREATE OR REPLACE FUNCTION public.notify_case_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case_no text := COALESCE(NEW.case_no, NEW.case_number::text, NEW.project_name, 'Vorgang');
  v_recipient uuid;
BEGIN
  -- Assignment changed: notify new assignee (if not actor and not null)
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     AND NEW.assignee_id IS NOT NULL
     AND NEW.assignee_id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (NEW.assignee_id, 'assignment',
      'Vorgang zugewiesen: ' || v_case_no,
      NEW.project_name,
      '/cases/' || NEW.id::text);
  END IF;

  -- Status changed: notify assignee, creator, watchers
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    FOR v_recipient IN
      SELECT DISTINCT uid FROM (
        SELECT NEW.assignee_id AS uid
        UNION SELECT NEW.created_by
        UNION SELECT unnest(COALESCE(NEW.watchers, ARRAY[]::uuid[]))
      ) s
      WHERE uid IS NOT NULL AND uid <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, href)
      VALUES (v_recipient, 'status_change',
        'Status geändert · ' || v_case_no,
        OLD.status::text || ' → ' || NEW.status::text,
        '/cases/' || NEW.id::text);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_case_change ON public.cases;
CREATE TRIGGER trg_notify_case_change
AFTER UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.notify_case_change();

-- 4) Subtask status change
CREATE OR REPLACE FUNCTION public.notify_task_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case RECORD;
  v_recipient uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT assignee_id, COALESCE(case_no, case_number::text, project_name, 'Vorgang') AS cno
    INTO v_case FROM public.cases WHERE id = NEW.case_id;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_case.assignee_id AS uid
      UNION SELECT NEW.assigned_to
      UNION SELECT NEW.created_by
    ) s
    WHERE uid IS NOT NULL AND uid <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (v_recipient, 'task_status_change',
      'Unteraufgabe: ' || OLD.status || ' → ' || NEW.status,
      v_case.cno || ' · ' || NEW.title,
      '/cases/' || NEW.case_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_status_change ON public.case_tasks;
CREATE TRIGGER trg_notify_task_status_change
AFTER UPDATE ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_status_change();

-- 5) Project status change
CREATE OR REPLACE FUNCTION public.notify_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recipient uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT NEW.owner_id AS uid
      UNION SELECT NEW.created_by
      UNION SELECT user_id FROM public.project_members WHERE project_id = NEW.id
    ) s
    WHERE uid IS NOT NULL AND uid <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (v_recipient, 'project_status_change',
      'Projekt: ' || COALESCE(NEW.project_number, NEW.name),
      'Status: ' || COALESCE(OLD.status::text,'—') || ' → ' || COALESCE(NEW.status::text,'—'),
      '/projects/' || NEW.id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_project_status_change ON public.projects;
CREATE TRIGGER trg_notify_project_status_change
AFTER UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_project_status_change();

-- 6) New note in case
CREATE OR REPLACE FUNCTION public.notify_new_case_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case RECORD;
  v_author_name text;
  v_recipient uuid;
  v_preview text;
BEGIN
  SELECT assignee_id, watchers, created_by, COALESCE(case_no, case_number::text, project_name, 'Vorgang') AS cno
    INTO v_case FROM public.cases WHERE id = NEW.case_id;

  SELECT COALESCE(display_name, short_code, 'Jemand') INTO v_author_name
    FROM public.users_profile WHERE id = NEW.author_id;

  v_preview := CASE
    WHEN length(NEW.body) > 100 THEN substring(NEW.body for 100) || '…'
    ELSE NEW.body
  END;

  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_case.assignee_id AS uid
      UNION SELECT v_case.created_by
      UNION SELECT unnest(COALESCE(v_case.watchers, ARRAY[]::uuid[]))
    ) s
    WHERE uid IS NOT NULL AND uid <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (v_recipient, 'note_created',
      v_author_name || ' · Notiz in ' || v_case.cno,
      v_preview,
      '/cases/' || NEW.case_id::text);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_case_note ON public.case_notes;
CREATE TRIGGER trg_notify_new_case_note
AFTER INSERT ON public.case_notes
FOR EACH ROW EXECUTE FUNCTION public.notify_new_case_note();
