ALTER TABLE public.case_templates
  ADD COLUMN IF NOT EXISTS lock_mode text NOT NULL DEFAULT 'hard'
    CHECK (lock_mode IN ('hard','soft'));

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS lock_mode text NOT NULL DEFAULT 'hard'
    CHECK (lock_mode IN ('hard','soft'));