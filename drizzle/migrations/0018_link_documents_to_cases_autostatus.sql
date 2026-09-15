ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offers_case_id ON public.offers(case_id);
CREATE INDEX IF NOT EXISTS idx_orders_case_id ON public.orders(case_id);

CREATE OR REPLACE FUNCTION public.apply_case_status_from_doc(
  _case_id uuid, _target case_status, _action text, _message text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cur case_status;
BEGIN
  IF _case_id IS NULL THEN RETURN; END IF;
  SELECT status INTO cur FROM public.cases WHERE id = _case_id;
  IF cur IS NULL THEN RETURN; END IF;
  IF cur = _target OR cur IN ('abgeschlossen','verworfen','archiv') THEN RETURN; END IF;
  IF _target = 'in_arbeit' AND cur NOT IN ('nicht_begonnen','in_planung') THEN RETURN; END IF;
  UPDATE public.cases SET status = _target WHERE id = _case_id;
  INSERT INTO public.case_activity (case_id, action, field, old_value, new_value, message, actor_id)
  VALUES (_case_id, _action, 'status', cur::text, _target::text, _message, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.offer_sent_sync_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.case_id IS NOT NULL AND NEW.status = 'versendet' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.apply_case_status_from_doc(NEW.case_id, 'in_arbeit'::case_status, 'auto_status', 'Angebot ' || COALESCE(NEW.offer_no,'') || ' versendet');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_offer_sent_sync_case ON public.offers;
CREATE TRIGGER trg_offer_sent_sync_case AFTER INSERT OR UPDATE OF status, case_id ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.offer_sent_sync_case();

CREATE OR REPLACE FUNCTION public.order_completed_sync_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.case_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.apply_case_status_from_doc(NEW.case_id, 'abgeschlossen'::case_status, 'auto_status', 'Auftrag ' || COALESCE(NEW.order_no,'') || ' abgeschlossen');
  ELSIF NEW.status IN ('active','in_progress','confirmed','partially_delivered','delivered','partially_invoiced','invoiced')
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.apply_case_status_from_doc(NEW.case_id, 'in_arbeit'::case_status, 'auto_status', 'Auftrag ' || COALESCE(NEW.order_no,'') || ' in Bearbeitung');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_order_completed_sync_case ON public.orders;
CREATE TRIGGER trg_order_completed_sync_case AFTER INSERT OR UPDATE OF status, case_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.order_completed_sync_case();

CREATE OR REPLACE FUNCTION public.log_case_pdf_print(_case_id uuid, _doc_label text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _case_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.case_activity (case_id, action, field, message, actor_id)
  VALUES (_case_id, 'pdf_print', 'document', COALESCE(_doc_label,'PDF') || ' erzeugt', auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_case_pdf_print(uuid, text) TO authenticated;