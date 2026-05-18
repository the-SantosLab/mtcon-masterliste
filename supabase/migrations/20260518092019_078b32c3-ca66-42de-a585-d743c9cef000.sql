CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read system_settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin insert system_settings"
  ON public.system_settings FOR INSERT TO authenticated WITH CHECK (check_is_admin());

CREATE POLICY "Admin update system_settings"
  ON public.system_settings FOR UPDATE TO authenticated USING (check_is_admin()) WITH CHECK (check_is_admin());

CREATE POLICY "Admin delete system_settings"
  ON public.system_settings FOR DELETE TO authenticated USING (check_is_admin());

INSERT INTO public.system_settings (key, value)
VALUES ('session_timeout_hours', '8'::jsonb)
ON CONFLICT (key) DO NOTHING;