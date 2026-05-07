ALTER TABLE public.case_activity DISABLE TRIGGER USER;

ALTER TABLE public.case_activity DROP CONSTRAINT IF EXISTS case_activity_case_id_fkey;
ALTER TABLE public.case_activity DROP CONSTRAINT IF EXISTS case_activity_task_id_fkey;
ALTER TABLE public.case_notes DROP CONSTRAINT IF EXISTS case_notes_case_id_fkey;
ALTER TABLE public.case_tasks DROP CONSTRAINT IF EXISTS case_tasks_case_id_fkey;

DELETE FROM public.case_activity WHERE case_id NOT IN (SELECT id FROM public.cases);
DELETE FROM public.case_notes WHERE case_id NOT IN (SELECT id FROM public.cases);
DELETE FROM public.case_tasks WHERE case_id NOT IN (SELECT id FROM public.cases);
UPDATE public.case_activity SET task_id = NULL
  WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT id FROM public.case_tasks);

ALTER TABLE public.case_activity
  ADD CONSTRAINT case_activity_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_activity
  ADD CONSTRAINT case_activity_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.case_tasks(id) ON DELETE CASCADE;

ALTER TABLE public.case_notes
  ADD CONSTRAINT case_notes_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_tasks
  ADD CONSTRAINT case_tasks_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_activity ENABLE TRIGGER USER;