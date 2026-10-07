CREATE OR REPLACE FUNCTION public.trg_delivery_require_print()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'shipped' AND COALESCE(OLD.status::text,'') <> 'shipped'
     AND COALESCE(OLD.locked,false) = false THEN
    RAISE EXCEPTION 'Lieferschein % ist noch ein Entwurf. Bitte zuerst den Lieferschein erstellen/drucken, dann versenden.', OLD.delivery_no;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_aa_require_print ON public.deliveries;
CREATE TRIGGER trg_delivery_aa_require_print
BEFORE UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_require_print();