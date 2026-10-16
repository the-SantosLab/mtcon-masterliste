ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS ean text;
CREATE UNIQUE INDEX IF NOT EXISTS articles_ean_unique ON public.articles (ean) WHERE ean IS NOT NULL AND ean <> '';
COMMENT ON COLUMN public.articles.ean IS 'Hersteller-/Lieferanten-Barcode (EAN/GTIN) für Scan-Suche';