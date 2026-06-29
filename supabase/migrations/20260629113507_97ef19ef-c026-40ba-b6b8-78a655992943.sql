
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS closure_summary text,
  ADD COLUMN IF NOT EXISTS closure_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_cases_archived_at ON public.cases(archived_at) WHERE archived_at IS NOT NULL;
