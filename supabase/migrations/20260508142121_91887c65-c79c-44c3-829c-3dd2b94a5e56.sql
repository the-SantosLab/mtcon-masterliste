ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS watchers uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  vorgang_id uuid,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads notifications log" ON public.notifications_log
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "System inserts notifications log" ON public.notifications_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_log_vorgang ON public.notifications_log(vorgang_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_sent ON public.notifications_log(sent_at DESC);