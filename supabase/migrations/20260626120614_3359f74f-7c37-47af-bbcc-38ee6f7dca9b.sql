
-- 1. Offer share tokens (public acceptance)
CREATE TABLE public.offer_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_share_tokens_offer ON public.offer_share_tokens(offer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_share_tokens TO authenticated;
GRANT ALL ON public.offer_share_tokens TO service_role;
ALTER TABLE public.offer_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read offer tokens" ON public.offer_share_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage offer tokens" ON public.offer_share_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Offer events log
CREATE TABLE public.offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('viewed','accepted','rejected','sent','downloaded')),
  actor_name text,
  actor_email text,
  comment text,
  ip_address text,
  user_agent text,
  signature_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_events_offer ON public.offer_events(offer_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.offer_events TO authenticated;
GRANT ALL ON public.offer_events TO service_role;
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read offer events" ON public.offer_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert offer events" ON public.offer_events FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Web form endpoints
CREATE TABLE public.crm_web_form_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  default_owner_id uuid REFERENCES auth.users(id),
  default_source text DEFAULT 'website',
  redirect_url text,
  allowed_origins text[] DEFAULT ARRAY[]::text[],
  notify_user_ids uuid[] DEFAULT ARRAY[]::uuid[],
  honeypot_field text DEFAULT 'website_url',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_web_form_endpoints TO authenticated;
GRANT ALL ON public.crm_web_form_endpoints TO service_role;
ALTER TABLE public.crm_web_form_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage web forms" ON public.crm_web_form_endpoints FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Consent log (GDPR)
CREATE TABLE public.crm_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('marketing','transactional','tracking','profiling')),
  action text NOT NULL CHECK (action IN ('opt_in','opt_out')),
  source text,
  ip_address text,
  user_agent text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_email ON public.crm_consent_log(email, occurred_at DESC);
CREATE INDEX idx_consent_contact ON public.crm_consent_log(contact_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.crm_consent_log TO authenticated;
GRANT ALL ON public.crm_consent_log TO service_role;
ALTER TABLE public.crm_consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read consent" ON public.crm_consent_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write consent" ON public.crm_consent_log FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Won deal -> auto create order from latest accepted offer
CREATE OR REPLACE FUNCTION public.create_order_from_won_deal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offer_id uuid;
  v_order_id uuid;
  v_order_no text;
  v_year int := extract(year FROM now())::int;
  v_seq int;
BEGIN
  IF NEW.stage = 'won' AND (OLD.stage IS DISTINCT FROM 'won') THEN
    -- skip if an order already references this deal via notes (simple guard)
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

    INSERT INTO public.counters(name, value) VALUES ('orders_'||v_year, 1)
      ON CONFLICT (name) DO UPDATE SET value = public.counters.value + 1
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
END $$;

DROP TRIGGER IF EXISTS trg_won_deal_to_order ON public.deals;
CREATE TRIGGER trg_won_deal_to_order
AFTER UPDATE OF stage ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.create_order_from_won_deal();
