
-- When case assignee changes, keep previous assignee in the loop as a watcher
-- and notify them about the handoff.
CREATE OR REPLACE FUNCTION public.notify_case_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case_no text := COALESCE(NEW.case_no, NEW.case_number::text, NEW.project_name, 'Vorgang');
  v_new_name text;
BEGIN
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     AND OLD.assignee_id IS NOT NULL
  THEN
    -- Add previous assignee to watchers if not already present
    IF NOT (OLD.assignee_id = ANY(COALESCE(NEW.watchers, ARRAY[]::uuid[]))) THEN
      NEW.watchers := array_append(COALESCE(NEW.watchers, ARRAY[]::uuid[]), OLD.assignee_id);
    END IF;

    -- Notify previous assignee (unless they triggered it themselves)
    IF OLD.assignee_id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      SELECT COALESCE(display_name, short_code, 'jemand anderen') INTO v_new_name
        FROM public.users_profile WHERE id = NEW.assignee_id;

      INSERT INTO public.notifications (user_id, type, title, body, href)
      VALUES (OLD.assignee_id, 'assignment',
        'Vorgang übergeben: ' || v_case_no,
        'Übergeben an ' || COALESCE(v_new_name, 'jemand anderen') || '. Du bleibst als Beobachter eingebunden.',
        '/cases/' || NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_case_handoff ON public.cases;
CREATE TRIGGER trg_notify_case_handoff
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.notify_case_handoff();


-- When subtask assigned_to changes, notify previous and new assignee.
CREATE OR REPLACE FUNCTION public.notify_task_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case_no text;
  v_new_name text;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    SELECT COALESCE(case_no, case_number::text, project_name, 'Vorgang') INTO v_case_no
      FROM public.cases WHERE id = NEW.case_id;

    -- Notify previous assignee
    IF OLD.assigned_to IS NOT NULL
       AND OLD.assigned_to <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
      SELECT COALESCE(display_name, short_code, 'jemand anderen') INTO v_new_name
        FROM public.users_profile WHERE id = NEW.assigned_to;

      INSERT INTO public.notifications (user_id, type, title, body, href)
      VALUES (OLD.assigned_to, 'assignment',
        'Unteraufgabe übergeben · ' || COALESCE(v_case_no, 'Vorgang'),
        NEW.title || ' – übergeben an ' || COALESCE(v_new_name, 'jemand anderen'),
        '/cases/' || NEW.case_id::text);
    END IF;

    -- Notify new assignee
    IF NEW.assigned_to IS NOT NULL
       AND NEW.assigned_to <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    THEN
      INSERT INTO public.notifications (user_id, type, title, body, href)
      VALUES (NEW.assigned_to, 'assignment',
        'Unteraufgabe zugewiesen · ' || COALESCE(v_case_no, 'Vorgang'),
        NEW.title,
        '/cases/' || NEW.case_id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_handoff ON public.case_tasks;
CREATE TRIGGER trg_notify_task_handoff
BEFORE UPDATE ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_handoff();
