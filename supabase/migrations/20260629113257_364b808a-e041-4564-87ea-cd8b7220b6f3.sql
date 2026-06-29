ALTER TABLE public.case_tasks
  ADD COLUMN IF NOT EXISTS required_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_outputs jsonb NOT NULL DEFAULT '[]'::jsonb;