
CREATE TABLE public.issos_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rech_nr integer NOT NULL UNIQUE,
  nummer integer,
  belegart text,
  belegart_text text,
  r_kd_nr text,
  matchcode text,
  rech_dat date,
  netto_fw numeric(14,2),
  mwst1_fw numeric(14,2),
  mwst2_fw numeric(14,2),
  brutto_fw numeric(14,2),
  waehrung text,
  iae_kz text,
  iae_text text,
  druck_kz integer,
  druck_text text,
  druck_dat date,
  kz_erl boolean,
  zb integer,
  ust_id text,
  storno_kz boolean,
  ausloeser text,
  ziel1 date,
  skonto1 numeric(8,4),
  ziel2 date,
  skonto2 numeric(8,4),
  datum_net date,
  kz_sammel integer,
  sammel_text text,
  pers_nr integer,
  fibu_dat date,
  mis_datum timestamptz,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issos_inv_company ON public.issos_invoices(company_id);
CREATE INDEX idx_issos_inv_date ON public.issos_invoices(rech_dat DESC);
CREATE INDEX idx_issos_inv_kdnr ON public.issos_invoices(r_kd_nr);

CREATE TABLE public.issos_invoice_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rech_nr integer NOT NULL,
  invoice_id uuid REFERENCES public.issos_invoices(id) ON DELETE CASCADE,
  nummer integer,
  r_kd_nr text,
  matchcode text,
  rech_folge integer,
  auf_nr integer,
  aufpos integer,
  ls_nr integer,
  art_nr text,
  bezeich1 text,
  menge numeric(14,3),
  preis_fw numeric(14,4),
  waehrung text,
  netto_fw numeric(14,2),
  art_kunde text,
  vertr_nr text,
  bes_dat1 date,
  erloeskto text,
  folge integer,
  kz_preis text,
  rabatt_pos numeric(8,4),
  zu_pos text,
  zu_bezeich text,
  preis1_fw numeric(14,4),
  wert1_fw numeric(14,2),
  wert2_fw numeric(14,2),
  mwst_satz numeric(8,4),
  mwst1_fw numeric(14,2),
  kosten numeric(14,4),
  kostenherk text,
  bewertungspreis numeric(14,4),
  kosten2 numeric(14,4),
  marge numeric(14,4),
  marge_v numeric(8,4),
  marge_e numeric(8,4),
  land text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issos_pos_invoice ON public.issos_invoice_positions(invoice_id);
CREATE INDEX idx_issos_pos_rechnr ON public.issos_invoice_positions(rech_nr);
CREATE INDEX idx_issos_pos_artnr ON public.issos_invoice_positions(art_nr);

CREATE TABLE public.issos_invoice_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer integer,
  rech_nr integer NOT NULL,
  invoice_id uuid REFERENCES public.issos_invoices(id) ON DELETE CASCADE,
  r_kd_nr text,
  matchcode text,
  rech_folge integer,
  zusatzpos text,
  bezeich text,
  nettow_fw numeric(14,2),
  waehrung text,
  menge numeric(14,3),
  ls_datum date,
  kst text,
  kst_text text,
  ktr text,
  ktr_text text,
  nettow_gw numeric(14,2),
  ls_nr integer,
  erloeskto text,
  mwst_satz numeric(8,4),
  mwst_kto text,
  mwst_gr text,
  mwst_gr_text text,
  mwst1_fw numeric(14,2),
  mwst1_gw numeric(14,2),
  mwst2_fw numeric(14,2),
  mwst2_gw numeric(14,2),
  bruttow_fw numeric(14,2),
  bruttow_gw numeric(14,2),
  text_note text,
  kosten numeric(14,4),
  kostenherk text,
  bew_zusatzkosten numeric(14,4),
  kosten2 numeric(14,4),
  marge numeric(14,4),
  marge_v numeric(8,4),
  marge_e numeric(8,4),
  land text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_issos_ex_invoice ON public.issos_invoice_extras(invoice_id);
CREATE INDEX idx_issos_ex_rechnr ON public.issos_invoice_extras(rech_nr);

CREATE TABLE public.issos_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_kind text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_unmatched integer NOT NULL DEFAULT 0,
  rows_error integer NOT NULL DEFAULT 0,
  error_log jsonb,
  ran_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.issos_invoices TO authenticated;
GRANT SELECT ON public.issos_invoice_positions TO authenticated;
GRANT SELECT ON public.issos_invoice_extras TO authenticated;
GRANT SELECT ON public.issos_import_runs TO authenticated;
GRANT ALL ON public.issos_invoices TO service_role;
GRANT ALL ON public.issos_invoice_positions TO service_role;
GRANT ALL ON public.issos_invoice_extras TO service_role;
GRANT ALL ON public.issos_import_runs TO service_role;

ALTER TABLE public.issos_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issos_invoice_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issos_invoice_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issos_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read issos_invoices" ON public.issos_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_invoices" ON public.issos_invoices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated read issos_positions" ON public.issos_invoice_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_positions" ON public.issos_invoice_positions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated read issos_extras" ON public.issos_invoice_extras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_extras" ON public.issos_invoice_extras FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Authenticated read issos_runs" ON public.issos_import_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage issos_runs" ON public.issos_import_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_issos_invoices_updated BEFORE UPDATE ON public.issos_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
