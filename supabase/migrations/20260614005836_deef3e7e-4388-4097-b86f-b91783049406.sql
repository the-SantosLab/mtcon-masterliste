
CREATE TABLE public.supplier_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  rated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quality smallint NOT NULL,
  delivery smallint NOT NULL,
  price smallint NOT NULL,
  communication smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_ratings_quality_range CHECK (quality BETWEEN 1 AND 5),
  CONSTRAINT supplier_ratings_delivery_range CHECK (delivery BETWEEN 1 AND 5),
  CONSTRAINT supplier_ratings_price_range CHECK (price BETWEEN 1 AND 5),
  CONSTRAINT supplier_ratings_communication_range CHECK (communication BETWEEN 1 AND 5)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_ratings TO authenticated;
GRANT ALL ON public.supplier_ratings TO service_role;

ALTER TABLE public.supplier_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read supplier_ratings"
  ON public.supplier_ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "users insert own ratings"
  ON public.supplier_ratings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rated_by);

CREATE POLICY "users update own ratings"
  ON public.supplier_ratings FOR UPDATE TO authenticated
  USING (auth.uid() = rated_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = rated_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete ratings"
  ON public.supplier_ratings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_supplier_ratings_updated
  BEFORE UPDATE ON public.supplier_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.supplier_rating_summary AS
SELECT
  s.id AS supplier_id,
  s.name AS supplier_name,
  COUNT(r.id)::int AS rating_count,
  ROUND(AVG(r.quality)::numeric, 2) AS avg_quality,
  ROUND(AVG(r.delivery)::numeric, 2) AS avg_delivery,
  ROUND(AVG(r.price)::numeric, 2) AS avg_price,
  ROUND(AVG(r.communication)::numeric, 2) AS avg_communication,
  ROUND(AVG((r.quality + r.delivery + r.price + r.communication) / 4.0)::numeric, 2) AS avg_overall
FROM public.suppliers s
LEFT JOIN public.supplier_ratings r ON r.supplier_id = s.id
GROUP BY s.id, s.name;

GRANT SELECT ON public.supplier_rating_summary TO authenticated;
