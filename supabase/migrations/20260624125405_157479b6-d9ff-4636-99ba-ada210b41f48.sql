CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL,
  valid_from date NOT NULL,
  rate_to_eur numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency, valid_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_rates read for authenticated" ON public.fx_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "fx_rates admin write" ON public.fx_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX fx_rates_currency_date_idx ON public.fx_rates (currency, valid_from DESC);

INSERT INTO public.fx_rates (currency, valid_from, rate_to_eur) VALUES
  ('$', '2017-01-01', 0.92),
  ('USD', '2017-01-01', 0.92);