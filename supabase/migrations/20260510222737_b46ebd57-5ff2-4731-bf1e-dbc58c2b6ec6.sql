
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS cases_deleted_idx ON public.cases (deleted) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS cases_deleted_at_idx ON public.cases (deleted_at) WHERE deleted = true;

CREATE OR REPLACE FUNCTION public.purge_trashed_cases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH del AS (
    DELETE FROM public.cases
    WHERE deleted = true
      AND deleted_at IS NOT NULL
      AND deleted_at < now() - interval '90 days'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM del;
  RETURN v_count;
END;
$$;
