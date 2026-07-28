-- Automatische Auftragserzeugung, wenn ein Angebot auf 'angenommen' wechselt
CREATE OR REPLACE FUNCTION public.crm_offer_accepted_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_order_id uuid;
  v_company_name text;
  v_contact_email text;
  v_net numeric := 0;
BEGIN
  -- Nur reagieren, wenn Status wirklich auf 'angenommen' wechselt
  IF NEW.status IS DISTINCT FROM 'angenommen'::offer_status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- accepted_at absichern (falls die App es nicht mitgesetzt hat)
  IF NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  END IF;

  -- Idempotenz: existiert bereits ein Auftrag zu diesem Angebot?
  SELECT id INTO v_existing_id
  FROM public.orders
  WHERE external_order_no = NEW.offer_no
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Trotzdem Deal auf won setzen, falls noch nicht geschehen
    IF NEW.deal_id IS NOT NULL THEN
      UPDATE public.deals
         SET stage = 'won'::deal_stage,
             won_at = COALESCE(won_at, now())
       WHERE id = NEW.deal_id
         AND stage IS DISTINCT FROM 'won'::deal_stage;
    END IF;
    RETURN NEW;
  END IF;

  -- Nettosumme aus Angebotspositionen berechnen
  SELECT COALESCE(SUM(quantity * unit_price * (1 - COALESCE(discount_pct, 0) / 100.0)), 0)
    INTO v_net
    FROM public.offer_items
   WHERE offer_id = NEW.id;

  -- Kundenname / Kontakt-Email für Order-Snapshot ermitteln
  SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
  SELECT email INTO v_contact_email FROM public.contacts WHERE id = NEW.primary_contact_id;

  -- Auftrag anlegen
  INSERT INTO public.orders (
    status, source, order_kind,
    company_id, customer_name, customer_email,
    external_order_no, order_date,
    payment_terms, currency,
    subtotal_amount, tax_amount, total_amount,
    notes, created_by
  ) VALUES (
    'active', 'offer', 'new',
    NEW.company_id, v_company_name, v_contact_email,
    NEW.offer_no, CURRENT_DATE,
    NEW.payment_terms, 'EUR',
    ROUND(v_net, 2),
    ROUND(v_net * 0.19, 2),
    ROUND(v_net * 1.19, 2),
    NEW.notes, COALESCE(NEW.owner_id, NEW.created_by)
  )
  RETURNING id INTO v_new_order_id;

  -- Positionen aus offer_items übernehmen
  INSERT INTO public.order_items (
    order_id, position, art_nr, sku, description,
    quantity, unit_price, line_total, tax_rate
  )
  SELECT
    v_new_order_id,
    (ROW_NUMBER() OVER (ORDER BY sort_order, id))::int,
    art_nr, art_nr, description,
    quantity, unit_price,
    ROUND(quantity * unit_price * (1 - COALESCE(discount_pct, 0) / 100.0), 2),
    19
  FROM public.offer_items
  WHERE offer_id = NEW.id;

  -- Deal auf won setzen
  IF NEW.deal_id IS NOT NULL THEN
    UPDATE public.deals
       SET stage = 'won'::deal_stage,
           won_at = COALESCE(won_at, now())
     WHERE id = NEW.deal_id
       AND stage IS DISTINCT FROM 'won'::deal_stage;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_accepted_to_order ON public.offers;
CREATE TRIGGER trg_offer_accepted_to_order
BEFORE UPDATE OF status ON public.offers
FOR EACH ROW
WHEN (NEW.status = 'angenommen'::offer_status AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.crm_offer_accepted_to_order();