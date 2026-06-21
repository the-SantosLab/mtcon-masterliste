CREATE TABLE public.mtiq_tablets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'business_card',
  status TEXT NOT NULL DEFAULT 'in_progress',
  current_step INT NOT NULL DEFAULT 1,
  source_file_path TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mtiq_tablets TO authenticated;
GRANT ALL ON public.mtiq_tablets TO service_role;

ALTER TABLE public.mtiq_tablets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own tablets or admins all" ON public.mtiq_tablets
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own tablets" ON public.mtiq_tablets
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own tablets or admins" ON public.mtiq_tablets
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete tablets" ON public.mtiq_tablets
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_mtiq_tablets_updated_at
  BEFORE UPDATE ON public.mtiq_tablets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mtiq_tablets;
ALTER TABLE public.mtiq_tablets REPLICA IDENTITY FULL;