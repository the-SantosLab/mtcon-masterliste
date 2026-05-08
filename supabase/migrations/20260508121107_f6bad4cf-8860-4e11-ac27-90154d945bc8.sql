ALTER TABLE public.case_activity
  DROP CONSTRAINT IF EXISTS case_activity_case_id_fkey;

ALTER TABLE public.case_activity
  ADD CONSTRAINT case_activity_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- Avoid the DELETE branch of the audit trigger trying to insert
-- a new activity row that would reference the just-deleted case.
CREATE OR REPLACE FUNCTION public.log_case_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Do not log into case_activity on delete; cascade will remove rows.
    RETURN OLD;
  END IF;

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
$function$;