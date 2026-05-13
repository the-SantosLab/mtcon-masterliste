CREATE OR REPLACE FUNCTION public.log_case_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, new_value, message)
    VALUES (NEW.case_id, NEW.id, 'task_created', v_actor, 'title', NEW.title, 'Unteraufgabe angelegt: ' || NEW.title);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.case_activity (case_id, task_id, action, actor_id, field, old_value, message)
    VALUES (OLD.case_id, NULL, 'task_deleted', v_actor, 'title', OLD.title, 'Unteraufgabe gelöscht: ' || OLD.title);
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
$function$;