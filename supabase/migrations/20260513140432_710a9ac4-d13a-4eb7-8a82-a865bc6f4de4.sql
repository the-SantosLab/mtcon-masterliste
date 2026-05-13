
-- Extend offer_status enum
ALTER TYPE offer_status ADD VALUE IF NOT EXISTS 'abgelaufen';

-- Customer tier enum
DO $$ BEGIN
  CREATE TYPE customer_tier AS ENUM ('standard','premium','distributor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- offers extensions
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_offer_id uuid,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- offer_items extensions
ALTER TABLE public.offer_items
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- crm_activities extensions
ALTER TABLE public.crm_activities
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_by uuid;

-- price_list_items
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  customer_tier customer_tier NOT NULL DEFAULT 'standard',
  price numeric NOT NULL DEFAULT 0,
  min_quantity numeric NOT NULL DEFAULT 1,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read" ON public.price_list_items;
DROP POLICY IF EXISTS "staff insert" ON public.price_list_items;
DROP POLICY IF EXISTS "staff update" ON public.price_list_items;
DROP POLICY IF EXISTS "admin delete" ON public.price_list_items;

CREATE POLICY "auth read" ON public.price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insert" ON public.price_list_items FOR INSERT TO authenticated WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'));
CREATE POLICY "staff update" ON public.price_list_items FOR UPDATE TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff')) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'));
CREATE POLICY "admin delete" ON public.price_list_items FOR DELETE TO authenticated USING (check_is_admin());

CREATE INDEX IF NOT EXISTS idx_price_list_items_product ON public.price_list_items(product_id);

-- Auto-follow-up: offer sent
CREATE OR REPLACE FUNCTION public.crm_offer_sent_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid; v_company text; v_company_id uuid;
BEGIN
  IF NEW.status = 'versendet' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT d.owner_id, c.name, c.id INTO v_owner, v_company, v_company_id
      FROM public.deals d LEFT JOIN public.companies c ON c.id=d.company_id
      WHERE d.id = NEW.deal_id;
    INSERT INTO public.crm_activities(deal_id, company_id, type, subject, due_at, owner_id, auto_generated)
    VALUES (NEW.deal_id, v_company_id, 'task',
      'Angebot ' || NEW.offer_no || ' bei ' || COALESCE(v_company,'Kunde') || ' nachfassen',
      now() + interval '3 days', v_owner, true);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_offer_sent_followup ON public.offers;
CREATE TRIGGER trg_offer_sent_followup AFTER UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.crm_offer_sent_followup();

-- Auto-follow-up: deal won
CREATE OR REPLACE FUNCTION public.crm_deal_won_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.stage = 'won' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    INSERT INTO public.crm_activities(deal_id, company_id, type, subject, due_at, owner_id, auto_generated)
    VALUES (NEW.id, NEW.company_id, 'task',
      'Übergabe an Produktion bestätigen',
      now() + interval '1 day', NEW.owner_id, true);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_deal_won_followup ON public.deals;
CREATE TRIGGER trg_deal_won_followup AFTER UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.crm_deal_won_followup();

-- Ensure deal_no, offer_no auto-generate
DROP TRIGGER IF EXISTS trg_assign_deal_no ON public.deals;
CREATE TRIGGER trg_assign_deal_no BEFORE INSERT ON public.deals
FOR EACH ROW WHEN (NEW.deal_no IS NULL OR NEW.deal_no = 'PENDING')
EXECUTE FUNCTION public.assign_deal_number();

DROP TRIGGER IF EXISTS trg_assign_offer_no ON public.offers;
CREATE TRIGGER trg_assign_offer_no BEFORE INSERT ON public.offers
FOR EACH ROW WHEN (NEW.offer_no IS NULL OR NEW.offer_no = 'PENDING')
EXECUTE FUNCTION public.assign_offer_number();

DROP TRIGGER IF EXISTS trg_deal_stage_changed ON public.deals;
CREATE TRIGGER trg_deal_stage_changed BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.deals_stage_changed();
