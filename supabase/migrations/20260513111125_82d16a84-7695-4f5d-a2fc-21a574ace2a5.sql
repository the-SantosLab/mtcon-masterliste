CREATE OR REPLACE FUNCTION public.case_activity_block_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow ON DELETE SET NULL cascades from case_tasks to clear task_id
  IF NEW.task_id IS NULL
     AND OLD.task_id IS NOT NULL
     AND NEW.case_id IS NOT DISTINCT FROM OLD.case_id
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.field IS NOT DISTINCT FROM OLD.field
     AND NEW.old_value IS NOT DISTINCT FROM OLD.old_value
     AND NEW.new_value IS NOT DISTINCT FROM OLD.new_value
     AND NEW.message IS NOT DISTINCT FROM OLD.message
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'case_activity entries are immutable';
END;
$function$;