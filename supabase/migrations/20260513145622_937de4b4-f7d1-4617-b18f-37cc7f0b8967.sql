
CREATE TABLE IF NOT EXISTS public.crm_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE,
  email text,
  is_unsubscribed boolean NOT NULL DEFAULT true,
  unsubscribed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

ALTER TABLE public.crm_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read crm_unsub" ON public.crm_unsubscribes FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert crm_unsub" ON public.crm_unsubscribes FOR INSERT TO authenticated
  WITH CHECK (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff update crm_unsub" ON public.crm_unsubscribes FOR UPDATE TO authenticated
  USING (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "admin delete crm_unsub" ON public.crm_unsubscribes FOR DELETE TO authenticated USING (check_is_admin());

CREATE TABLE IF NOT EXISTS public.crm_email_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid,
  enrollment_id uuid,
  contact_id uuid,
  to_email text NOT NULL,
  subject text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  step_number integer
);

CREATE INDEX IF NOT EXISTS idx_crm_email_tracking_activity ON public.crm_email_tracking(activity_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_tracking_contact ON public.crm_email_tracking(contact_id);

ALTER TABLE public.crm_email_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read crm_email_tracking" ON public.crm_email_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert crm_email_tracking" ON public.crm_email_tracking FOR INSERT TO authenticated
  WITH CHECK (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "staff update crm_email_tracking" ON public.crm_email_tracking FOR UPDATE TO authenticated
  USING (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  WITH CHECK (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "admin delete crm_email_tracking" ON public.crm_email_tracking FOR DELETE TO authenticated USING (check_is_admin());
