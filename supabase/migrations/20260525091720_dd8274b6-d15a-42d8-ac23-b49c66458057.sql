
-- Corrections table for learning from user edits
CREATE TABLE IF NOT EXISTS public.mtiq_draft_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES public.mtiq_drafts(id) ON DELETE CASCADE,
  original_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.mtiq_draft_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_can_insert_corrections"
  ON public.mtiq_draft_corrections FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_can_read_corrections"
  ON public.mtiq_draft_corrections FOR SELECT TO authenticated
  USING (true);

-- Duplicate detection + original snapshot on drafts
ALTER TABLE public.mtiq_drafts
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid REFERENCES public.cases(id) ON DELETE SET NULL;

ALTER TABLE public.mtiq_drafts
  ADD COLUMN IF NOT EXISTS original_snapshot jsonb;

-- Full-text search index on cases (German config)
CREATE INDEX IF NOT EXISTS idx_cases_fts
  ON public.cases USING GIN (
    to_tsvector('german',
      coalesce(project_name,'') || ' ' ||
      coalesce(client_name,'') || ' ' ||
      coalesce(note,'') || ' ' ||
      coalesce(customer_no,'') || ' ' ||
      coalesce(case_no,'')
    )
  );
