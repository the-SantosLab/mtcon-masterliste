
CREATE TABLE public.price_change_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  art_nr TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value NUMERIC,
  new_value NUMERIC,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.price_change_log TO authenticated;
GRANT ALL ON public.price_change_log TO service_role;
ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read price change log" ON public.price_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert price change log" ON public.price_change_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_price_change_log_art_nr ON public.price_change_log(art_nr);
CREATE INDEX idx_price_change_log_created_at ON public.price_change_log(created_at DESC);

CREATE TABLE public.scheduled_price_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  art_nr TEXT NOT NULL,
  field_name TEXT NOT NULL,
  new_value NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_price_changes TO authenticated;
GRANT ALL ON public.scheduled_price_changes TO service_role;
ALTER TABLE public.scheduled_price_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read scheduled price changes" ON public.scheduled_price_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage scheduled price changes" ON public.scheduled_price_changes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_scheduled_price_changes_updated_at BEFORE UPDATE ON public.scheduled_price_changes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_scheduled_price_changes_effective ON public.scheduled_price_changes(effective_date) WHERE applied = false;
