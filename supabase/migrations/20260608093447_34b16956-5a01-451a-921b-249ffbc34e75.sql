
-- MTIQ Triage: Vorgang vs. Dokumentablage + Versions-Vorschläge

ALTER TABLE public.mtiq_drafts
  ADD COLUMN IF NOT EXISTS route text NOT NULL DEFAULT 'vorgang',
  ADD COLUMN IF NOT EXISTS recommended_reason text,
  ADD COLUMN IF NOT EXISTS attachment_match_proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS route_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS route_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Sicherstellen, dass die bestehende status-Check-Constraint erhalten bleibt.
ALTER TABLE public.mtiq_drafts
  DROP CONSTRAINT IF EXISTS mtiq_drafts_route_check;
ALTER TABLE public.mtiq_drafts
  ADD CONSTRAINT mtiq_drafts_route_check
  CHECK (route IN ('vorgang','dokument','unklar'));

CREATE INDEX IF NOT EXISTS idx_mtiq_drafts_route ON public.mtiq_drafts(route, status, created_at DESC);

-- Audit-Log für Dokument-Übernahmen aus MTIQ
CREATE TABLE IF NOT EXISTS public.document_intake_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mtiq_draft_id uuid REFERENCES public.mtiq_drafts(id) ON DELETE SET NULL,
  attachment_id uuid REFERENCES public.mtiq_draft_attachments(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('new_version','new_document','skip','duplicate_ignored')),
  new_version_no integer,
  change_note text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.document_intake_log TO authenticated;
GRANT ALL ON public.document_intake_log TO service_role;

ALTER TABLE public.document_intake_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_log read own/admin" ON public.document_intake_log
  FOR SELECT TO authenticated
  USING (check_is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "intake_log insert own" ON public.document_intake_log
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR check_is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_intake_log_draft ON public.document_intake_log(mtiq_draft_id);
CREATE INDEX IF NOT EXISTS idx_intake_log_document ON public.document_intake_log(document_id);
