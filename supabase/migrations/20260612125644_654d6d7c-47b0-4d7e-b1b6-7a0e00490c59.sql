
-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.partner_role AS ENUM ('lead','customer','supplier','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) companies erweitern
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS partner_role public.partner_role NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS vat_id text,
  ADD COLUMN IF NOT EXISTS tax_no text,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS supplier_code text,
  ADD COLUMN IF NOT EXISTS billing_street text,
  ADD COLUMN IF NOT EXISTS billing_zip text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_country text,
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_country text,
  ADD COLUMN IF NOT EXISTS payment_terms_days int,
  ADD COLUMN IF NOT EXISTS payment_terms_text text,
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS credit_limit numeric(14,2),
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bic text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS last_changed_by uuid;

-- Initial: legacy "type" → partner_role
UPDATE public.companies
   SET partner_role = CASE
     WHEN type = 'kunde' THEN 'customer'::public.partner_role
     WHEN type::text = 'lieferant' THEN 'supplier'::public.partner_role
     WHEN type::text = 'partner' THEN 'both'::public.partner_role
     ELSE 'lead'::public.partner_role
   END
 WHERE partner_role = 'lead' AND type IS NOT NULL;

-- Unique sparse indexes für Nummern
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_customer_no ON public.companies (customer_no) WHERE customer_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_supplier_code ON public.companies (supplier_code) WHERE supplier_code IS NOT NULL;

-- 3) Generatoren für customer_no / supplier_code
CREATE OR REPLACE FUNCTION public.next_partner_customer_no()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n int;
BEGIN
  v_n := public.next_counter('partner_customer');
  RETURN 'K-' || lpad(v_n::text, 5, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_partner_supplier_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n int;
BEGIN
  v_n := public.next_counter('partner_supplier');
  RETURN 'L-' || lpad(v_n::text, 5, '0');
END $$;

-- 4) Trigger: Nummern automatisch vergeben + last_changed_by setzen
CREATE OR REPLACE FUNCTION public.companies_assign_partner_numbers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.partner_role IN ('customer','both') AND (NEW.customer_no IS NULL OR length(trim(NEW.customer_no)) = 0) THEN
    NEW.customer_no := public.next_partner_customer_no();
  END IF;
  IF NEW.partner_role IN ('supplier','both') AND (NEW.supplier_code IS NULL OR length(trim(NEW.supplier_code)) = 0) THEN
    NEW.supplier_code := public.next_partner_supplier_code();
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.last_changed_by := COALESCE(auth.uid(), NEW.last_changed_by);
  ELSIF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_partner_numbers ON public.companies;
CREATE TRIGGER trg_companies_partner_numbers
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_assign_partner_numbers();

-- 5) Backfill: vorhandene customers in companies übernehmen
INSERT INTO public.companies (name, customer_no, partner_role, type)
SELECT c.name, c.customer_no, 'customer'::public.partner_role, 'kunde'::company_type
FROM public.customers c
WHERE NOT EXISTS (SELECT 1 FROM public.companies co WHERE co.customer_no = c.customer_no);

-- 6) FK-Spalten auf den Belegen
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries      ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.invoices        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company          ON public.orders(company_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_company      ON public.deliveries(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company        ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON public.purchase_orders(company_id);

-- 7) Backfill der FK auf orders/invoices, wo customer_no matched
UPDATE public.orders o
   SET company_id = c.id
  FROM public.companies c
 WHERE o.company_id IS NULL
   AND o.customer_no IS NOT NULL
   AND c.customer_no = o.customer_no;

UPDATE public.invoices i
   SET company_id = c.id
  FROM public.companies c
 WHERE i.company_id IS NULL
   AND i.customer_no IS NOT NULL
   AND c.customer_no = i.customer_no;
