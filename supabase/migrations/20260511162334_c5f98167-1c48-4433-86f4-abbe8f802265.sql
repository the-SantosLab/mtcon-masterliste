ALTER TABLE public.case_tasks
  ADD COLUMN IF NOT EXISTS due_at date;

ALTER TABLE public.case_templates
  ADD COLUMN IF NOT EXISTS due_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS due_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_case_tasks_assigned_due ON public.case_tasks(assigned_to, due_at) WHERE status <> 'done';