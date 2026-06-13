
DO $$ BEGIN
  CREATE TYPE public.storage_location_type AS ENUM ('regal', 'kanban', 'sperrlager', 'archiv', 'versand', 'sonstiges');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lager text NOT NULL,
  lagerpl text NOT NULL DEFAULT '0',
  behaelter text NOT NULL DEFAULT '0',
  code text GENERATED ALWAYS AS (lager || ' / ' || lagerpl || ' / ' || behaelter) STORED,
  type public.storage_location_type NOT NULL DEFAULT 'regal',
  fifo_required boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  capacity numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (lager, lagerpl, behaelter)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_locations TO authenticated;
GRANT ALL ON public.storage_locations TO service_role;

ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_locations_select_auth"
  ON public.storage_locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "storage_locations_insert_staff"
  ON public.storage_locations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "storage_locations_update_staff"
  ON public.storage_locations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "storage_locations_delete_admin"
  ON public.storage_locations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_storage_locations_updated_at
  BEFORE UPDATE ON public.storage_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.storage_locations (lager, lagerpl, behaelter, type, is_blocked)
SELECT DISTINCT
  COALESCE(NULLIF(trim(lager), ''), 'UNBEKANNT'),
  COALESCE(NULLIF(trim(lagerpl), ''), '0'),
  COALESCE(NULLIF(trim(behaelter), ''), '0'),
  CASE
    WHEN UPPER(COALESCE(lager,'')) LIKE '%SPERR%' THEN 'sperrlager'::public.storage_location_type
    WHEN UPPER(COALESCE(lager,'')) LIKE '%ARCHIV%' OR UPPER(COALESCE(lagerpl,'')) LIKE '%ARCHIV%' THEN 'archiv'::public.storage_location_type
    WHEN UPPER(COALESCE(lager,'')) LIKE '%KANBAN%' OR UPPER(COALESCE(lagerpl,'')) LIKE 'KW%' THEN 'kanban'::public.storage_location_type
    ELSE 'regal'::public.storage_location_type
  END,
  CASE WHEN UPPER(COALESCE(lager,'')) LIKE '%SPERR%' THEN true ELSE false END
FROM public.article_stock_locations
WHERE lager IS NOT NULL
ON CONFLICT (lager, lagerpl, behaelter) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_storage_locations_lager ON public.storage_locations(lager);
CREATE INDEX IF NOT EXISTS idx_storage_locations_type ON public.storage_locations(type);
