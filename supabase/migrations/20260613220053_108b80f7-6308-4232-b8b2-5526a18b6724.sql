
CREATE TABLE IF NOT EXISTS public.article_stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL,
  lager text NOT NULL,
  lagerpl text NOT NULL DEFAULT '',
  behaelter text NOT NULL DEFAULT '',
  charge_nr text NOT NULL DEFAULT '',
  charge_ext text,
  bestand numeric NOT NULL DEFAULT 0,
  sb_menge numeric NOT NULL DEFAULT 0,
  mb_menge numeric NOT NULL DEFAULT 0,
  verp_mg numeric,
  me text,
  datum_zu date,
  datum_abg date,
  best_inv numeric,
  datum_inv date,
  fuellgrad_pct numeric,
  aend_ind text,
  aend_dat date,
  res_auf_nr text,
  res_auf_pos text,
  res_wa_nr text,
  source text NOT NULL DEFAULT 'MANUAL',
  note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_stock_locations_uniq UNIQUE (art_nr, lager, lagerpl, behaelter, charge_nr)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_stock_locations TO authenticated;
GRANT ALL ON public.article_stock_locations TO service_role;

ALTER TABLE public.article_stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asl_read_authenticated"
  ON public.article_stock_locations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "asl_write_admin"
  ON public.article_stock_locations FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "asl_update_admin"
  ON public.article_stock_locations FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "asl_delete_admin"
  ON public.article_stock_locations FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS asl_art_nr_idx ON public.article_stock_locations (art_nr);
CREATE INDEX IF NOT EXISTS asl_lager_idx ON public.article_stock_locations (lager, lagerpl);

CREATE TRIGGER trg_asl_updated_at BEFORE UPDATE ON public.article_stock_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
