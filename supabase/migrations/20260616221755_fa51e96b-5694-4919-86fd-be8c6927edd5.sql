
-- Lieferschein-Header
CREATE TABLE public.issos_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ls_nr integer NOT NULL UNIQUE,
  kd_nr text,
  matchcode text,
  ls_datum date,
  druck_kz integer,
  druck_text text,
  druck_dat timestamptz,
  buch_kz integer,
  buch_text text,
  kz_erl boolean,
  lb text,
  va text,
  vp text,
  packstuecke numeric,
  brutto_gew numeric,
  netto_gew numeric,
  pers_nr text,
  lieferadr integer,
  auf_nr_la integer,
  name1 text,
  strasse text,
  land text,
  plz text,
  ort text,
  sprache text,
  sprache_text text,
  kz_konsi boolean,
  kz_kons_ab boolean,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issos_deliveries_company ON public.issos_deliveries(company_id);
CREATE INDEX idx_issos_deliveries_kd_nr ON public.issos_deliveries(kd_nr);
CREATE INDEX idx_issos_deliveries_datum ON public.issos_deliveries(ls_datum DESC);

GRANT SELECT ON public.issos_deliveries TO authenticated;
GRANT ALL ON public.issos_deliveries TO service_role;
ALTER TABLE public.issos_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read issos_deliveries" ON public.issos_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_deliveries" ON public.issos_deliveries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_issos_deliveries_updated_at BEFORE UPDATE ON public.issos_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Angebotspositionen
CREATE TABLE public.issos_offer_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ang_nr integer NOT NULL,
  ang_pos integer,
  kd_nr text,
  matchcode text,
  int_nr text,
  matchcode_1 text,
  a_status text,
  a_status_text text,
  art_nr text,
  art_matchcode text,
  bezeich_1 text,
  art_kunde text,
  ang_menge numeric,
  me text,
  netto_gw numeric,
  preis_fw numeric,
  waehrung text,
  kz_preis boolean,
  pe numeric,
  ang_datum date,
  kurs numeric,
  rabatt_pos numeric,
  mat_art text,
  mat_art_text text,
  kosten numeric,
  kostenherk text,
  bewertungspreis numeric,
  kosten_1 numeric,
  marge numeric,
  marge_v numeric,
  marge_e numeric,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issos_offer_pos_company ON public.issos_offer_positions(company_id);
CREATE INDEX idx_issos_offer_pos_ang ON public.issos_offer_positions(ang_nr);
CREATE INDEX idx_issos_offer_pos_kd ON public.issos_offer_positions(kd_nr);
CREATE INDEX idx_issos_offer_pos_art ON public.issos_offer_positions(art_nr);

GRANT SELECT ON public.issos_offer_positions TO authenticated;
GRANT ALL ON public.issos_offer_positions TO service_role;
ALTER TABLE public.issos_offer_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read issos_offer_positions" ON public.issos_offer_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_offer_positions" ON public.issos_offer_positions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
