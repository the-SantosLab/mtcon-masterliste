
-- Add new statuses to case_status enum
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'ready_for_review' AFTER 'abgeschlossen';
ALTER TYPE public.case_status ADD VALUE IF NOT EXISTS 'blocked' AFTER 'ready_for_review';

-- Create workflow_settings table for configurable behavior
CREATE TABLE public.workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users_profile(id)
);

ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages workflow settings" ON public.workflow_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Staff can read workflow settings" ON public.workflow_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'staff'::app_role));

-- Insert default workflow settings
INSERT INTO public.workflow_settings (key, value, description) VALUES
  ('auto_forward', '{"enabled": true, "on_all_done": "ready_for_review", "on_no_department": "blocked"}', 'Verhalten beim automatischen Weiterschieben von Vorgängen'),
  ('case_defaults', '{"initial_status": "nicht_begonnen"}', 'Standard-Werte für neue Vorgänge');
