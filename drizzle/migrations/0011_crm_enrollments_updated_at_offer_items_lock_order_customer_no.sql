ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Positionen gesperrter Angebote schützen (Admins ausgenommen)
CREATE OR REPLACE FUNCTION public.enforce_offer_items_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offer uuid; v_locked boolean;
BEGIN
  v_offer := COALESCE(NEW.offer_id, OLD.offer_id);
  SELECT COALESCE(locked,false) INTO v_locked FROM public.offers WHERE id = v_offer;
  IF v_locked AND NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Angebot ist gesperrt (angenommen) – Positionen können nicht mehr geändert werden';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_offer_items_enforce_lock ON public.offer_items;
CREATE TRIGGER trg_offer_items_enforce_lock BEFORE INSERT OR UPDATE OR DELETE ON public.offer_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_items_lock();

-- Kundennummer auch auf Aufträge übertragen, die über "Angebot angenommen" entstanden sind
CREATE OR REPLACE FUNCTION public.crm_deal_won_promote_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'won' AND OLD.stage IS DISTINCT FROM 'won' AND NEW.company_id IS NOT NULL THEN
    UPDATE public.companies
       SET partner_role = (CASE WHEN partner_role = 'supplier'::public.partner_role THEN 'both' ELSE 'customer' END)::public.partner_role
     WHERE id = NEW.company_id AND partner_role IN ('lead'::public.partner_role,'supplier'::public.partner_role);
    UPDATE public.orders o SET customer_no = c.customer_no
      FROM public.companies c
     WHERE c.id = NEW.company_id AND o.company_id = c.id AND o.customer_no IS NULL AND c.customer_no IS NOT NULL
       AND (o.notes LIKE '%deal:'||NEW.id::text||'%'
            OR o.external_order_no IN (SELECT offer_no FROM public.offers WHERE deal_id = NEW.id));
  END IF;
  RETURN NEW;
END $$;