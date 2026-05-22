
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS urgency smallint NOT NULL DEFAULT 0 CHECK (urgency BETWEEN 0 AND 5);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS urgency smallint NOT NULL DEFAULT 0 CHECK (urgency BETWEEN 0 AND 5);
ALTER TABLE public.case_tasks ADD COLUMN IF NOT EXISTS urgency smallint NOT NULL DEFAULT 0 CHECK (urgency BETWEEN 0 AND 5);
CREATE INDEX IF NOT EXISTS idx_cases_urgency ON public.cases(urgency DESC);
CREATE INDEX IF NOT EXISTS idx_projects_urgency ON public.projects(urgency DESC);
