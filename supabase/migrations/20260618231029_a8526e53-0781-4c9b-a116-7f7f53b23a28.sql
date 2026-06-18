ALTER TABLE public.mtiq_drafts
  ADD COLUMN IF NOT EXISTS doc_classification text,
  ADD COLUMN IF NOT EXISTS routing_suggestion text,
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb,
  ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'text';

COMMENT ON COLUMN public.mtiq_drafts.doc_classification IS 'Versicherung | Lieferschein | Anfrage | Bestellung | Sonstiges';
COMMENT ON COLUMN public.mtiq_drafts.routing_suggestion IS 'vorgang_anlegen | dokument_ablegen | beides | unklar';
COMMENT ON COLUMN public.mtiq_drafts.source_kind IS 'text | email | scan';