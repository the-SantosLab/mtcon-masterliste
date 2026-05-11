ALTER TABLE public.case_activity
  DROP CONSTRAINT IF EXISTS case_activity_task_id_fkey;

ALTER TABLE public.case_activity
  ADD CONSTRAINT case_activity_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.case_tasks(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;