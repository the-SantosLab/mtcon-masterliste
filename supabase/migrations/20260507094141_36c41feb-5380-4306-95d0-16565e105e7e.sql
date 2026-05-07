-- Add task_id to case_activity for subtask tracking
ALTER TABLE public.case_activity
  ADD COLUMN IF NOT EXISTS task_id uuid;

-- Make case_activity immutable: block all UPDATEs at trigger level
CREATE OR REPLACE FUNCTION public.case_activity_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'case_activity entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_case_activity_no_update ON public.case_activity;
CREATE TRIGGER trg_case_activity_no_update
BEFORE UPDATE ON public.case_activity
FOR EACH ROW EXECUTE FUNCTION public.case_activity_block_update();

-- Auto-log changes to cases (only fields not already logged manually)
CREATE OR REPLACE FUNCTION public.log_case_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, message)
    VALUES (OLD.id, 'deleted', v_actor, 'Vorgang gelöscht: ' || COALESCE(OLD.case_no, OLD.id::text));
    RETURN OLD;
  END IF;

  -- UPDATE: log scalar field changes (skip ones already logged in app code)
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'due_at', OLD.due_at::text, NEW.due_at::text);
  END IF;
  IF NEW.project_name IS DISTINCT FROM OLD.project_name THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'project_name', OLD.project_name, NEW.project_name);
  END IF;
  IF NEW.note IS DISTINCT FROM OLD.note THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'note', left(COALESCE(OLD.note,''),120), left(COALESCE(NEW.note,''),120));
  END IF;
  IF NEW.estimated_hours IS DISTINCT FROM OLD.estimated_hours THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'estimated_hours', OLD.estimated_hours::text, NEW.estimated_hours::text);
  END IF;
  IF NEW.client_name IS DISTINCT FROM OLD.client_name THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'client_name', OLD.client_name, NEW.client_name);
  END IF;
  IF NEW.customer_no IS DISTINCT FROM OLD.customer_no THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'customer_no', OLD.customer_no, NEW.customer_no);
  END IF;
  IF NEW.project_article_no IS DISTINCT FROM OLD.project_article_no THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'project_article_no', OLD.project_article_no, NEW.project_article_no);
  END IF;
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'quantity', OLD.quantity::text, NEW.quantity::text);
  END IF;
  IF NEW.sop IS DISTINCT FROM OLD.sop THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'sop', OLD.sop, NEW.sop);
  END IF;
  IF NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value)
    VALUES (NEW.id, 'updated', v_actor, 'received_at', OLD.received_at::text, NEW.received_at::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_case_change ON public.cases;
CREATE TRIGGER trg_log_case_change
AFTER UPDATE OR DELETE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.log_case_change();

-- Auto-log changes to case_tasks
CREATE OR REPLACE FUNCTION public.log_case_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, new_value, message)
    VALUES (NEW.case_id, NEW.id, 'task_created', v_actor, 'title', NEW.title, 'Unteraufgabe angelegt: ' || NEW.title);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, message)
    VALUES (OLD.case_id, OLD.id, 'task_deleted', v_actor, 'title', OLD.title, 'Unteraufgabe gelöscht: ' || OLD.title);
    RETURN OLD;
  ELSE
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, new_value, message)
      VALUES (NEW.case_id, NEW.id, 'task_updated', v_actor, 'title', OLD.title, NEW.title, 'Titel geändert');
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, new_value, message)
      VALUES (NEW.case_id, NEW.id, 'task_updated', v_actor, 'status', OLD.status, NEW.status, NEW.title);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, new_value, message)
      VALUES (NEW.case_id, NEW.id, 'task_updated', v_actor, 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text, NEW.title);
    END IF;
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
      INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, new_value, message)
      VALUES (NEW.case_id, NEW.id, 'task_updated', v_actor, 'department_id', OLD.department_id::text, NEW.department_id::text, NEW.title);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_case_task_change ON public.case_tasks;
CREATE TRIGGER trg_log_case_task_change
AFTER INSERT OR UPDATE OR DELETE ON public.case_tasks
FOR EACH ROW EXECUTE FUNCTION public.log_case_task_change();