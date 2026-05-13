-- CRM Module: tables, RLS, triggers, seed data

-- Enums
CREATE TYPE public.company_type AS ENUM ('kunde','distributor','mitbewerber');
CREATE TYPE public.deal_stage AS ENUM ('anfrage','qualifikation','angebot_versendet','verhandlung','won','lost');
CREATE TYPE public.offer_status AS ENUM ('entwurf','versendet','angenommen','abgelehnt');
CREATE TYPE public.crm_activity_type AS ENUM ('call','email','meeting','task','note');
CREATE TYPE public.sequence_channel AS ENUM ('email','task');
CREATE TYPE public.sequence_enrollment_status AS ENUM ('active','paused','done');

-- companies
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.company_type NOT NULL DEFAULT 'kunde',
  website text, industry text, address text, country text,
  customer_no text,
  notes text,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- contacts
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text, phone text, position text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- lost_reasons (seed first so deals can reference it)
CREATE TABLE public.lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.lost_reasons (label, sort_order) VALUES
  ('Preis', 10),('Timing', 20),('Wettbewerb', 30),
  ('Kein Bedarf', 40),('Kein Budget', 50),('Sonstiges', 99);

-- deals
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_no text NOT NULL DEFAULT 'PENDING',
  title text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  primary_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  stage public.deal_stage NOT NULL DEFAULT 'anfrage',
  value_estimated numeric,
  value_final numeric,
  currency text NOT NULL DEFAULT 'EUR',
  owner_id uuid,
  sop text, delivery_address text, quantity int,
  lost_reason_id uuid REFERENCES public.lost_reasons(id),
  lost_details text,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  won_case_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.deal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id uuid,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0
);

-- offers
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_no text NOT NULL DEFAULT 'PENDING',
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  status public.offer_status NOT NULL DEFAULT 'entwurf',
  valid_until date,
  total numeric NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0
);

-- price_lists
CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  valid_from date, valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- crm_activities
CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  type public.crm_activity_type NOT NULL,
  subject text NOT NULL,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sequences
CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  channel public.sequence_channel NOT NULL,
  subject text, body text,
  wait_days int NOT NULL DEFAULT 0
);
CREATE TABLE public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_step int NOT NULL DEFAULT 0,
  status public.sequence_enrollment_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- project_protection
CREATE TABLE public.project_protection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid,
  owner_id uuid,
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_offers_updated BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- deal_no auto
CREATE OR REPLACE FUNCTION public.assign_deal_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year text; v_counter int;
BEGIN
  v_year := to_char(now(),'YYYY');
  v_counter := public.next_counter('deal_'||v_year);
  NEW.deal_no := 'DEAL-'||v_year||'-'||lpad(v_counter::text,4,'0');
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_deals_no BEFORE INSERT ON public.deals FOR EACH ROW WHEN (NEW.deal_no IS NULL OR NEW.deal_no='PENDING') EXECUTE FUNCTION public.assign_deal_number();

-- offer_no auto
CREATE OR REPLACE FUNCTION public.assign_offer_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year text; v_counter int;
BEGIN
  v_year := to_char(now(),'YYYY');
  v_counter := public.next_counter('offer_'||v_year);
  NEW.offer_no := 'ANG-'||v_year||'-'||lpad(v_counter::text,4,'0');
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_offers_no BEFORE INSERT ON public.offers FOR EACH ROW WHEN (NEW.offer_no IS NULL OR NEW.offer_no='PENDING') EXECUTE FUNCTION public.assign_offer_number();

-- stage_changed_at maintain
CREATE OR REPLACE FUNCTION public.deals_stage_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN NEW.stage_changed_at := now(); END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_deals_stage BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.deals_stage_changed();

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_protection ENABLE ROW LEVEL SECURITY;

-- Generic policy helper: read = any authenticated; write = staff/admin; delete = admin
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'companies','contacts','deals','deal_items','offers','offer_items',
    'price_lists','crm_activities','sequences','sequence_steps',
    'sequence_enrollments','lost_reasons','project_protection'
  ]) LOOP
    EXECUTE format('CREATE POLICY "auth read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "staff insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.check_is_admin() OR public.has_role(auth.uid(),''staff''))', t);
    EXECUTE format('CREATE POLICY "staff update" ON public.%I FOR UPDATE TO authenticated USING (public.check_is_admin() OR public.has_role(auth.uid(),''staff'')) WITH CHECK (public.check_is_admin() OR public.has_role(auth.uid(),''staff''))', t);
    EXECUTE format('CREATE POLICY "admin delete" ON public.%I FOR DELETE TO authenticated USING (public.check_is_admin())', t);
  END LOOP;
END $$;