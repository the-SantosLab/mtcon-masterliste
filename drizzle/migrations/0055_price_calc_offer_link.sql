ALTER TABLE public.price_calculations ADD COLUMN offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL;
CREATE INDEX price_calculations_offer_idx ON public.price_calculations(offer_id);
CREATE OR REPLACE FUNCTION public.price_calc_apply_factors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND OLD.status = 'final' AND NOT public.has_role(auth.uid(),'admin') THEN
    -- Abgeschlossen: nur die Verknüpfung zum Angebot darf sich ändern
    IF (to_jsonb(NEW) - 'offer_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'offer_id' - 'updated_at') THEN
      RAISE EXCEPTION 'Abgeschlossene Kalkulationen kann nur ein Admin ändern';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    NEW.factor := (SELECT value FROM public.calc_settings WHERE key = 'factor');
    NEW.sws_factor := (SELECT value FROM public.calc_settings WHERE key = 'sws_factor');
  END IF;
  RETURN NEW;
END $$;