CREATE TABLE public.user_satisfaction_surveys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_functionality smallint NOT NULL CHECK (score_functionality BETWEEN 1 AND 5),
  score_design smallint NOT NULL CHECK (score_design BETWEEN 1 AND 5),
  score_performance smallint NOT NULL CHECK (score_performance BETWEEN 1 AND 5),
  missing_features text,
  design_improvements text,
  other text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT ON public.user_satisfaction_surveys TO authenticated;
GRANT ALL ON public.user_satisfaction_surveys TO service_role;

ALTER TABLE public.user_satisfaction_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_select_own_or_admin"
  ON public.user_satisfaction_surveys
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "survey_insert_own"
  ON public.user_satisfaction_surveys
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());