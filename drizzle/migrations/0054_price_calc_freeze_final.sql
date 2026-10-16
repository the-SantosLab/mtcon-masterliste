CREATE OR REPLACE FUNCTION public.price_calc_apply_factors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND OLD.status = 'final' AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Abgeschlossene Kalkulationen kann nur ein Admin ändern';
  END IF;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    NEW.factor := (SELECT value FROM public.calc_settings WHERE key = 'factor');
    NEW.sws_factor := (SELECT value FROM public.calc_settings WHERE key = 'sws_factor');
  END IF;
  RETURN NEW;
END $$;