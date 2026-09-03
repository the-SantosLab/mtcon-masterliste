ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'aktiv';
ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'pausiert';
ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'abgeschlossen';
ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'abgemeldet';
ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'geantwortet';
ALTER TYPE public.sequence_enrollment_status ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_action ON public.sequence_enrollments(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_company ON public.sequence_enrollments(company_id);

-- Backfill company from contact
UPDATE public.sequence_enrollments e SET company_id = c.company_id
  FROM public.contacts c WHERE c.id = e.contact_id AND e.company_id IS NULL;
UPDATE public.sequence_enrollments SET current_step_index = COALESCE(current_step, 0) WHERE current_step_index = 0 AND COALESCE(current_step,0) <> 0;

-- Keep legacy current_step in sync with current_step_index
CREATE OR REPLACE FUNCTION public.sequence_enrollments_sync_step()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_step_index IS DISTINCT FROM 0 THEN NEW.current_step := NEW.current_step_index;
    ELSIF COALESCE(NEW.current_step,0) <> 0 THEN NEW.current_step_index := NEW.current_step; END IF;
    IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
      SELECT company_id INTO NEW.company_id FROM public.contacts WHERE id = NEW.contact_id;
    END IF;
    IF NEW.next_action_at IS NULL THEN NEW.next_action_at := now(); END IF;
  ELSE
    IF NEW.current_step_index IS DISTINCT FROM OLD.current_step_index THEN NEW.current_step := NEW.current_step_index;
    ELSIF NEW.current_step IS DISTINCT FROM OLD.current_step THEN NEW.current_step_index := NEW.current_step; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sequence_enrollments_sync_step ON public.sequence_enrollments;
CREATE TRIGGER trg_sequence_enrollments_sync_step BEFORE INSERT OR UPDATE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.sequence_enrollments_sync_step();