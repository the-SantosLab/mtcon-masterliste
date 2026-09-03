ALTER TABLE public.sequence_enrollments ALTER COLUMN status SET DEFAULT 'aktiv'::public.sequence_enrollment_status;
UPDATE public.sequence_enrollments SET status='aktiv' WHERE status='active';
UPDATE public.sequence_enrollments SET status='pausiert' WHERE status='paused';
UPDATE public.sequence_enrollments SET status='abgeschlossen' WHERE status='done';

-- Gewonnener Deal: Firma wird Kunde (Kundennummer wird durch bestehenden Trigger vergeben)
CREATE OR REPLACE FUNCTION public.crm_deal_won_promote_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'won' AND OLD.stage IS DISTINCT FROM 'won' AND NEW.company_id IS NOT NULL THEN
    UPDATE public.companies
       SET partner_role = CASE WHEN partner_role = 'supplier' THEN 'both' ELSE 'customer' END
     WHERE id = NEW.company_id AND partner_role IN ('lead','supplier');
    -- Kundennummer auf bereits erzeugten Auftrag übertragen
    UPDATE public.orders o SET customer_no = c.customer_no
      FROM public.companies c
     WHERE c.id = NEW.company_id AND o.company_id = c.id AND o.customer_no IS NULL AND c.customer_no IS NOT NULL
       AND o.notes LIKE '%deal:'||NEW.id::text||'%';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_deal_won_promote_company ON public.deals;
CREATE TRIGGER zz_deal_won_promote_company AFTER UPDATE OF stage ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_deal_won_promote_company();

-- Angenommenes Angebot sperren
CREATE OR REPLACE FUNCTION public.crm_offer_lock_on_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'angenommen' AND OLD.status IS DISTINCT FROM 'angenommen' AND COALESCE(NEW.locked,false) = false THEN
    NEW.locked := true; NEW.locked_at := now(); NEW.locked_by := COALESCE(auth.uid(), NEW.locked_by);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_offer_lock_on_accept ON public.offers;
CREATE TRIGGER trg_offer_lock_on_accept BEFORE UPDATE OF status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.crm_offer_lock_on_accept();
UPDATE public.offers SET locked = true, locked_at = COALESCE(accepted_at, now()) WHERE status='angenommen' AND COALESCE(locked,false)=false;