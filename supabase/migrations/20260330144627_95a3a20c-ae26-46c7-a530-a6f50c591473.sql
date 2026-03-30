
-- 1. Extend case_tasks to support subtasks with department assignment
ALTER TABLE public.case_tasks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS description text;

-- 2. Extend cases with project info fields
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS sop text,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS project_duration text;

-- 3. Create index for subtask ordering
CREATE INDEX IF NOT EXISTS idx_case_tasks_sort ON public.case_tasks(case_id, sort_order);
