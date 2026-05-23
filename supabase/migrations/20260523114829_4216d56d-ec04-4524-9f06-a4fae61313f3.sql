ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_case_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_case_version ON public.cases;
CREATE TRIGGER trg_bump_case_version
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.bump_case_version();

CREATE INDEX IF NOT EXISTS idx_cases_id_version ON public.cases (id, version);