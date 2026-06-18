
CREATE TABLE IF NOT EXISTS public.issos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auf_nr integer NOT NULL UNIQUE,
  kd_nr text,
  matchcode text,
  ang_nr text,
  bes_dat_1 date,
  bes_dat_2 date,
  pers_nr text,
  lief_kunde text,
  rabatt numeric,
  vertr_nr text,
  druck_kz text,
  druck_text text,
  zb text,
  kz_preis boolean,
  lb text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issos_orders_company ON public.issos_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_issos_orders_kd ON public.issos_orders(kd_nr);

CREATE TABLE IF NOT EXISTS public.issos_order_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auf_nr integer NOT NULL,
  aufpos integer,
  termin date,
  kd_nr text,
  art_nr text,
  art_kunde text,
  besnr_kd text,
  kz_erl_p boolean,
  erl_dat date,
  preis_fw numeric,
  auf_menge numeric,
  gel_menge numeric,
  mat_art text,
  mat_art_text text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issos_order_pos_auf ON public.issos_order_positions(auf_nr);
CREATE INDEX IF NOT EXISTS idx_issos_order_pos_company ON public.issos_order_positions(company_id);
CREATE INDEX IF NOT EXISTS idx_issos_order_pos_art ON public.issos_order_positions(art_nr);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.issos_orders TO authenticated;
GRANT ALL ON public.issos_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issos_order_positions TO authenticated;
GRANT ALL ON public.issos_order_positions TO service_role;

ALTER TABLE public.issos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issos_order_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issos_orders read all auth" ON public.issos_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "issos_orders admin write" ON public.issos_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "issos_order_positions read all auth" ON public.issos_order_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "issos_order_positions admin write" ON public.issos_order_positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER issos_orders_updated_at BEFORE UPDATE ON public.issos_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
