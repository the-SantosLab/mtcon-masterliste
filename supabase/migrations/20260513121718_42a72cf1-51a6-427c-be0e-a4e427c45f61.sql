CREATE TABLE public.integration_settings (
  id text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- Nur Admins dürfen lesen / schreiben (Werte enthalten Secrets)
CREATE POLICY "Admins can view integration settings"
ON public.integration_settings FOR SELECT
TO authenticated
USING (public.check_is_admin(auth.uid()));

CREATE POLICY "Admins can insert integration settings"
ON public.integration_settings FOR INSERT
TO authenticated
WITH CHECK (public.check_is_admin(auth.uid()));

CREATE POLICY "Admins can update integration settings"
ON public.integration_settings FOR UPDATE
TO authenticated
USING (public.check_is_admin(auth.uid()))
WITH CHECK (public.check_is_admin(auth.uid()));

CREATE POLICY "Admins can delete integration settings"
ON public.integration_settings FOR DELETE
TO authenticated
USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_integration_settings_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();