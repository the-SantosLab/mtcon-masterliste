CREATE TABLE public.calc_settings (
  key text PRIMARY KEY,
  label text NOT NULL,
  value numeric,
  unit text,
  status text NOT NULL DEFAULT 'unclear' CHECK (status IN ('unclear','confirmed')),
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calc_settings TO authenticated;
GRANT ALL ON public.calc_settings TO service_role;
ALTER TABLE public.calc_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calc_settings read internal" ON public.calc_settings FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "calc_settings admin write" ON public.calc_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.price_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text,
  issos_offer_no text,
  supplier_offer text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_name text,
  calc_date date NOT NULL DEFAULT current_date,
  with_galvanik boolean NOT NULL DEFAULT true,
  with_pruefung boolean NOT NULL DEFAULT true,
  with_sws boolean NOT NULL DEFAULT false,
  with_lz boolean NOT NULL DEFAULT false,
  lz_quarter_avg numeric,
  lz_base numeric,
  lz_consumption numeric,
  factor numeric,
  sws_factor numeric,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_time_weeks numeric,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_calculations TO authenticated;
GRANT ALL ON public.price_calculations TO service_role;
ALTER TABLE public.price_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_calc read internal" ON public.price_calculations FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY "price_calc staff insert" ON public.price_calculations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "price_calc staff update" ON public.price_calculations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "price_calc admin delete" ON public.price_calculations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'staff') AND created_by = auth.uid() AND status = 'draft'));

-- Factors are taken from admin-maintained settings; non-admins cannot override them.
CREATE OR REPLACE FUNCTION public.price_calc_apply_factors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NOT public.has_role(auth.uid(),'admin') THEN
    NEW.factor := (SELECT value FROM public.calc_settings WHERE key = 'factor');
    NEW.sws_factor := (SELECT value FROM public.calc_settings WHERE key = 'sws_factor');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.price_calc_apply_factors() FROM PUBLIC, anon;
CREATE TRIGGER price_calc_apply_factors BEFORE INSERT OR UPDATE ON public.price_calculations
  FOR EACH ROW EXECUTE FUNCTION public.price_calc_apply_factors();