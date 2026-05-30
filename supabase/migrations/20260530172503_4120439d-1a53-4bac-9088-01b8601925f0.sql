
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS public.insurance_intake_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  field text NOT NULL,
  ai_value text,
  corrected_value text,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.insurance_intake_corrections TO authenticated;
GRANT ALL ON public.insurance_intake_corrections TO service_role;

ALTER TABLE public.insurance_intake_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_corr_read"
  ON public.insurance_intake_corrections FOR SELECT
  TO authenticated
  USING (public.can_read_doc_category(public.policy_category(policy_id)));

CREATE POLICY "intake_corr_insert"
  ON public.insurance_intake_corrections FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_doc_category(public.policy_category(policy_id)));

CREATE INDEX IF NOT EXISTS idx_intake_corr_policy ON public.insurance_intake_corrections(policy_id);
