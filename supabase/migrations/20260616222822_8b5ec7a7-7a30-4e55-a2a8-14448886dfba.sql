
CREATE TABLE IF NOT EXISTS public.issos_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ang_nr integer NOT NULL UNIQUE,
  kd_nr text,
  matchcode text,
  int_nr text,
  ang_stat text,
  ang_stat_text text,
  betreff1 text,
  betreff2 text,
  vorl_datum date,
  fristdat date,
  pers_nr text,
  vertr_nr text,
  rabatt numeric,
  druck_kz text,
  druck_kz_text text,
  druck_dat timestamptz,
  projekt_nr text,
  mandant text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issos_offers TO authenticated;
GRANT ALL ON public.issos_offers TO service_role;
ALTER TABLE public.issos_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read issos_offers" ON public.issos_offers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage issos_offers" ON public.issos_offers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_issos_offers_company ON public.issos_offers(company_id);
CREATE INDEX IF NOT EXISTS idx_issos_offers_kdnr ON public.issos_offers(kd_nr);
CREATE INDEX IF NOT EXISTS idx_issos_offers_matchcode ON public.issos_offers(matchcode);
