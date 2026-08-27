CREATE OR REPLACE FUNCTION public.create_order_from_won_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer_id uuid;
  v_order_id uuid;
  v_order_no text;
  v_year int := extract(year FROM now())::int;
  v_seq int;
BEGIN
  IF NEW.stage = 'won' AND (OLD.stage IS DISTINCT FROM 'won') THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE notes LIKE '%deal:'||NEW.id::text||'%') THEN
      RETURN NEW;
    END IF;

    SELECT id INTO v_offer_id FROM public.offers
     WHERE deal_id = NEW.id AND accepted_at IS NOT NULL
     ORDER BY accepted_at DESC LIMIT 1;
    IF v_offer_id IS NULL THEN
      SELECT id INTO v_offer_id FROM public.offers
       WHERE deal_id = NEW.id
       ORDER BY version DESC NULLS LAST, created_at DESC LIMIT 1;
    END IF;
    IF v_offer_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.counters(key, value) VALUES ('orders_'||v_year, 1)
      ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
      RETURNING value INTO v_seq;
    v_order_no := 'AUF-'||v_year||'-'||lpad(v_seq::text, 4, '0');

    INSERT INTO public.orders(order_no, status, source, order_kind, company_id, customer_name, order_date, currency, notes, created_by)
    SELECT v_order_no, 'open', 'crm', 'sales', d.company_id, c.name, current_date, COALESCE(d.currency,'EUR'),
           'deal:'||NEW.id::text||' offer:'||v_offer_id::text, NEW.owner_id
      FROM public.deals d
      LEFT JOIN public.companies c ON c.id = d.company_id
     WHERE d.id = NEW.id
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items(order_id, position, sku, art_nr, description, quantity, unit_price, line_total, created_at)
    SELECT v_order_id, COALESCE(oi.sort_order, row_number() OVER (ORDER BY oi.sort_order)), oi.art_nr, oi.art_nr,
           oi.description, oi.quantity, oi.unit_price,
           ROUND((oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100))::numeric, 2),
           now()
      FROM public.offer_items oi WHERE oi.offer_id = v_offer_id;

    UPDATE public.orders SET subtotal_amount = (SELECT COALESCE(SUM(line_total),0) FROM public.order_items WHERE order_id = v_order_id),
                              total_amount = (SELECT COALESCE(SUM(line_total),0) FROM public.order_items WHERE order_id = v_order_id)
     WHERE id = v_order_id;
  END IF;
  RETURN NEW;
END
$function$;