ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS priority_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cases_status_priority ON public.cases(status, priority_order);