-- MTIQ Email-to-Vorgang drafts
CREATE TABLE public.mtiq_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_email_subject text,
  source_email_body text,
  source_email_from text,
  draft_title text,
  draft_description text,
  draft_department text,
  draft_priority text CHECK (draft_priority IN ('Niedrig','Mittel','Hoch','Kritisch')),
  draft_due_date date,
  draft_tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  mtiq_reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vorgang_id uuid REFERENCES public.cases(id) ON DELETE SET NULL
);

CREATE INDEX idx_mtiq_drafts_status ON public.mtiq_drafts(status, created_at DESC);

ALTER TABLE public.mtiq_drafts ENABLE ROW LEVEL SECURITY;

-- All authenticated internal staff (any role) can read
CREATE POLICY "Staff can read mtiq_drafts"
  ON public.mtiq_drafts FOR SELECT
  TO authenticated
  USING (
    public.check_is_admin()
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'viewer'::app_role)
  );

-- Staff & admin can insert drafts (also used by edge function with user JWT)
CREATE POLICY "Staff can insert mtiq_drafts"
  ON public.mtiq_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.check_is_admin()
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- Staff & admin can update (edit drafts, approve, reject)
CREATE POLICY "Staff can update mtiq_drafts"
  ON public.mtiq_drafts FOR UPDATE
  TO authenticated
  USING (
    public.check_is_admin()
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- Admin can delete
CREATE POLICY "Admin can delete mtiq_drafts"
  ON public.mtiq_drafts FOR DELETE
  TO authenticated
  USING (public.check_is_admin());