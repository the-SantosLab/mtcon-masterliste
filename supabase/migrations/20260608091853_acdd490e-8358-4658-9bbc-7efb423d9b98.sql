
-- ============================================================
-- ARTIKEL-STAMMDATEN (ISSOS-Import)
-- ============================================================

-- Hauptartikel
CREATE TABLE public.articles (
  art_nr text PRIMARY KEY,
  matchcode text,
  bezeich_1 text,
  bezeich_2 text,
  memo_ext text,
  art_gr text,
  mat_art text,
  dispo_kz text,
  dispo_kz_label text,
  zolltarif_nr text,
  zeichnung_nr text,
  pe numeric,
  me text,
  bautyp text,
  t_art text,
  mwst_gr text,
  mwst_gr_label text,
  aend_ind text,
  aend_nr text,
  aend_dat date,
  art_stat text,
  art_stat_label text,
  kennung text,
  kennung_label text,
  ger_lfd_nr text,
  weber_art_nr text,
  mass_1 text,
  verp_mg numeric,
  mb_menge numeric,
  is_blocked boolean GENERATED ALWAYS AS (coalesce(art_stat,'') ~ '90|99') STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_articles_matchcode ON public.articles(matchcode);
CREATE INDEX idx_articles_art_gr ON public.articles(art_gr);
CREATE INDEX idx_articles_status ON public.articles(art_stat);
CREATE INDEX idx_articles_search ON public.articles USING gin (
  to_tsvector('simple', coalesce(art_nr,'') || ' ' || coalesce(matchcode,'') || ' ' || coalesce(bezeich_1,''))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read articles" ON public.articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Sachmerkmale (key/value)
CREATE TABLE public.article_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  attr_key text NOT NULL,
  attr_label text,
  attr_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (art_nr, attr_key)
);
CREATE INDEX idx_attr_art ON public.article_attributes(art_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_attributes TO authenticated;
GRANT ALL ON public.article_attributes TO service_role;
ALTER TABLE public.article_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read attrs" ON public.article_attributes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage attrs" ON public.article_attributes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Preise (1 pro Artikel)
CREATE TABLE public.article_prices (
  art_nr text PRIMARY KEY REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  waehrung text DEFAULT 'EUR',
  bewertungspreis numeric,
  standardpreis numeric,
  standardpreis_dat date,
  durchschnittspreis numeric,
  durchschnittspreis_dat date,
  letzter_ep numeric,
  letzter_ep_dat date,
  einkaufspreis numeric,
  einkaufspreis_dat date,
  buchung text,
  inventur text,
  abwertung numeric,
  dispo_lager numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_prices TO authenticated;
GRANT ALL ON public.article_prices TO service_role;
ALTER TABLE public.article_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read prices" ON public.article_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage prices" ON public.article_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Preislisten (Header)
CREATE TABLE public.article_price_lists (
  prl_nr text PRIMARY KEY,
  bezeichnung text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_price_lists TO authenticated;
GRANT ALL ON public.article_price_lists TO service_role;
ALTER TABLE public.article_price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read prl" ON public.article_price_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage prl" ON public.article_price_lists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Preislisten-Positionen
CREATE TABLE public.article_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  prl_nr text NOT NULL,
  bereich text,
  menge_von numeric,
  menge_bis numeric,
  vk_preis numeric,
  pf_kz boolean,
  br_preis numeric,
  waehrung text,
  me text,
  pe numeric,
  rab numeric,
  m_vk_preis numeric,
  bez_pl text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (art_nr, prl_nr, bereich, menge_von, menge_bis)
);
CREATE INDEX idx_pli_art ON public.article_price_list_items(art_nr);
CREATE INDEX idx_pli_prl ON public.article_price_list_items(prl_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_price_list_items TO authenticated;
GRANT ALL ON public.article_price_list_items TO service_role;
ALTER TABLE public.article_price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read pli" ON public.article_price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage pli" ON public.article_price_list_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Kundenartikel
CREATE TABLE public.article_customer_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  kunden_nr text NOT NULL,
  matchcode text,
  art_kunde text,
  bez_kunde text,
  memo text,
  aend_ind text,
  aend_dat date,
  aend_nr text,
  version_nr text,
  la_datum date,
  la_menge numeric,
  me text,
  la_preis numeric,
  ean_einz text,
  ean_samm text,
  rtz_kz text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (art_nr, kunden_nr, art_kunde)
);
CREATE INDEX idx_acr_art ON public.article_customer_refs(art_nr);
CREATE INDEX idx_acr_kunde ON public.article_customer_refs(kunden_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_customer_refs TO authenticated;
GRANT ALL ON public.article_customer_refs TO service_role;
ALTER TABLE public.article_customer_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read acr" ON public.article_customer_refs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage acr" ON public.article_customer_refs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Lieferantenartikel
CREATE TABLE public.article_supplier_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  lief_nr text NOT NULL,
  name_1 text,
  art_lief text,
  bez_lief text,
  folge text,
  me_liefer text,
  me_preis text,
  lieferzeit numeric,
  datum_l date,
  lb_preis numeric,
  lb_menge numeric,
  lb_datum date,
  bestell_nr text,
  lieferzeit_a numeric,
  dat_a_lz date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (art_nr, lief_nr, art_lief)
);
CREATE INDEX idx_asr_art ON public.article_supplier_refs(art_nr);
CREATE INDEX idx_asr_lief ON public.article_supplier_refs(lief_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_supplier_refs TO authenticated;
GRANT ALL ON public.article_supplier_refs TO service_role;
ALTER TABLE public.article_supplier_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read asr" ON public.article_supplier_refs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage asr" ON public.article_supplier_refs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Stückliste
CREATE TABLE public.article_bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_art_nr text NOT NULL REFERENCES public.articles(art_nr) ON DELETE CASCADE,
  pos text,
  component_art_nr text NOT NULL,
  component_matchcode text,
  component_bezeichnung text,
  component_art_stat text,
  component_kennung text,
  menge numeric,
  me text,
  ausschuss numeric,
  a_kz boolean,
  mehrm_me numeric,
  anfahrmg numeric,
  kst text,
  kst_label text,
  anzahl numeric,
  laenge_mm numeric,
  breite numeric,
  hoehe numeric,
  mehrm_ber numeric,
  et_kz boolean,
  set_kz boolean,
  v_position text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_art_nr, pos, component_art_nr)
);
CREATE INDEX idx_bom_parent ON public.article_bom(parent_art_nr);
CREATE INDEX idx_bom_component ON public.article_bom(component_art_nr);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_bom TO authenticated;
GRANT ALL ON public.article_bom TO service_role;
ALTER TABLE public.article_bom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read bom" ON public.article_bom FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage bom" ON public.article_bom FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Import-Log
CREATE TABLE public.article_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  import_type text NOT NULL,
  rows_processed integer DEFAULT 0,
  rows_inserted integer DEFAULT 0,
  rows_updated integer DEFAULT 0,
  rows_failed integer DEFAULT 0,
  error_details jsonb,
  duration_ms integer,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_air_created ON public.article_import_runs(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_import_runs TO authenticated;
GRANT ALL ON public.article_import_runs TO service_role;
ALTER TABLE public.article_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read import runs" ON public.article_import_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage import runs" ON public.article_import_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_articles_upd BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_attr_upd BEFORE UPDATE ON public.article_attributes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_prices_upd BEFORE UPDATE ON public.article_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_prl_upd BEFORE UPDATE ON public.article_price_lists FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pli_upd BEFORE UPDATE ON public.article_price_list_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_acr_upd BEFORE UPDATE ON public.article_customer_refs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_asr_upd BEFORE UPDATE ON public.article_supplier_refs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bom_upd BEFORE UPDATE ON public.article_bom FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Verknüpfung in Angebots-/Auftragspositionen
ALTER TABLE public.offer_items ADD COLUMN IF NOT EXISTS art_nr text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS art_nr text;
CREATE INDEX IF NOT EXISTS idx_offer_items_art_nr ON public.offer_items(art_nr);
CREATE INDEX IF NOT EXISTS idx_order_items_art_nr ON public.order_items(art_nr);
