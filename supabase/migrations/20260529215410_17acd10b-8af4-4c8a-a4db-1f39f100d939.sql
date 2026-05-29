-- =========================================================================
-- Insurance vault: categories, policies, documents, storage, RLS, search,
-- reminder helper. Read = Admin + Manager. Write/Delete = Admin only.
-- =========================================================================

-- 1) Categories ------------------------------------------------------------
CREATE TABLE public.insurance_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  color       text NOT NULL DEFAULT 'slate',
  icon        text NOT NULL DEFAULT 'shield',
  sort_order  int  NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_categories TO authenticated;
GRANT ALL ON public.insurance_categories TO service_role;

ALTER TABLE public.insurance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_cat_read_admin_manager" ON public.insurance_categories
  FOR SELECT TO authenticated
  USING (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()));

CREATE POLICY "ins_cat_write_admin" ON public.insurance_categories
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_ins_cat_updated_at
  BEFORE UPDATE ON public.insurance_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default category seed
INSERT INTO public.insurance_categories (name, description, color, icon, sort_order) VALUES
  ('Haftpflicht',      'Betriebs- und Berufshaftpflicht',          'sky',     'shield-check',  10),
  ('Sachversicherung', 'Inhalt, Gebäude, Elektronik',              'amber',   'building',      20),
  ('Cyber',            'Cyber-Risiken und Datenschutz',            'violet',  'lock',          30),
  ('KFZ',              'Fuhrpark und Dienstwagen',                 'emerald', 'car',           40),
  ('Personen',         'Kranken-, Unfall-, D&O',                   'rose',    'users',         50),
  ('Sonstige',         'Weitere Verträge ohne feste Kategorie',    'slate',   'folder',        99);

-- 2) Policies --------------------------------------------------------------
CREATE TABLE public.insurance_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid REFERENCES public.insurance_categories(id) ON DELETE SET NULL,
  name                text NOT NULL,
  provider            text,
  policy_number       text,
  description         text,
  insured_object      text,
  start_date          date,
  end_date            date,
  renewal_date        date,
  notice_period_days  int DEFAULT 90,
  premium_amount      numeric(12,2),
  premium_currency    text DEFAULT 'EUR',
  premium_interval    text DEFAULT 'yearly',
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  tags                text[] DEFAULT ARRAY[]::text[],
  status              text NOT NULL DEFAULT 'active',
  notes               text,
  search_tsv          tsvector,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_pol_read_admin_manager" ON public.insurance_policies
  FOR SELECT TO authenticated
  USING (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()));

CREATE POLICY "ins_pol_write_admin" ON public.insurance_policies
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

CREATE INDEX idx_ins_pol_category   ON public.insurance_policies(category_id);
CREATE INDEX idx_ins_pol_status     ON public.insurance_policies(status);
CREATE INDEX idx_ins_pol_end_date   ON public.insurance_policies(end_date);
CREATE INDEX idx_ins_pol_search_tsv ON public.insurance_policies USING GIN(search_tsv);
CREATE INDEX idx_ins_pol_tags       ON public.insurance_policies USING GIN(tags);

CREATE OR REPLACE FUNCTION public.insurance_policies_tsv_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv := setweight(to_tsvector('german', coalesce(NEW.name, '')), 'A')
    || setweight(to_tsvector('german', coalesce(NEW.provider, '')), 'A')
    || setweight(to_tsvector('german', coalesce(NEW.policy_number, '')), 'A')
    || setweight(to_tsvector('german', coalesce(NEW.insured_object, '')), 'B')
    || setweight(to_tsvector('german', coalesce(NEW.description, '')), 'C')
    || setweight(to_tsvector('german', coalesce(NEW.notes, '')), 'C')
    || setweight(to_tsvector('german', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ins_pol_tsv
  BEFORE INSERT OR UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.insurance_policies_tsv_update();

-- 3) Documents (with versioning) ------------------------------------------
CREATE TABLE public.insurance_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id     uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     bigint,
  mime_type     text,
  doc_kind      text NOT NULL DEFAULT 'police',
  version       int  NOT NULL DEFAULT 1,
  replaced_by   uuid REFERENCES public.insurance_documents(id) ON DELETE SET NULL,
  is_current    boolean NOT NULL DEFAULT true,
  description   text,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_documents TO authenticated;
GRANT ALL ON public.insurance_documents TO service_role;

ALTER TABLE public.insurance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_doc_read_admin_manager" ON public.insurance_documents
  FOR SELECT TO authenticated
  USING (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()));

CREATE POLICY "ins_doc_write_admin" ON public.insurance_documents
  FOR ALL TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

CREATE INDEX idx_ins_doc_policy  ON public.insurance_documents(policy_id);
CREATE INDEX idx_ins_doc_current ON public.insurance_documents(policy_id) WHERE is_current = true;

-- 4) Storage bucket --------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-documents', 'insurance-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ins_storage_read_admin_manager"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'insurance-documents'
    AND (public.check_is_admin(auth.uid()) OR public.check_is_manager(auth.uid()))
  );

CREATE POLICY "ins_storage_write_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'insurance-documents'
    AND public.check_is_admin(auth.uid())
  );

CREATE POLICY "ins_storage_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'insurance-documents' AND public.check_is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'insurance-documents' AND public.check_is_admin(auth.uid()));

CREATE POLICY "ins_storage_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'insurance-documents' AND public.check_is_admin(auth.uid()));

-- 5) Helper: derived effective status based on dates -----------------------
CREATE OR REPLACE FUNCTION public.insurance_policy_effective_status(p public.insurance_policies)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p.status IN ('cancelled','archived') THEN p.status
    WHEN p.end_date IS NOT NULL AND p.end_date < current_date THEN 'expired'
    WHEN p.end_date IS NOT NULL AND p.end_date <= current_date + 30 THEN 'expiring_soon'
    ELSE 'active'
  END;
$$;

-- 6) Reminder generator: writes into public.notifications for admins -------
CREATE OR REPLACE FUNCTION public.generate_insurance_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pol record;
  v_admin uuid;
  v_days int;
  v_count int := 0;
  v_title text;
  v_body text;
BEGIN
  FOR v_pol IN
    SELECT p.id, p.name, p.provider, p.policy_number, p.end_date, p.renewal_date, p.notice_period_days
    FROM public.insurance_policies p
    WHERE p.status = 'active'
      AND (
        (p.end_date IS NOT NULL AND p.end_date - current_date IN (60, 30, 14, 7, 1))
        OR (p.renewal_date IS NOT NULL AND p.renewal_date - current_date IN (60, 30, 14, 7, 1))
        OR (
          p.end_date IS NOT NULL AND p.notice_period_days IS NOT NULL
          AND (p.end_date - p.notice_period_days) - current_date IN (14, 7, 1)
        )
      )
  LOOP
    IF v_pol.end_date IS NOT NULL THEN
      v_days := v_pol.end_date - current_date;
      v_title := 'Versicherung läuft in ' || v_days || ' Tagen ab';
    ELSE
      v_days := v_pol.renewal_date - current_date;
      v_title := 'Verlängerung in ' || v_days || ' Tagen';
    END IF;
    v_body := v_pol.name || COALESCE(' · ' || v_pol.provider, '') || COALESCE(' · Police ' || v_pol.policy_number, '');

    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, type, title, body, href)
      VALUES (v_admin, 'insurance_reminder', v_title, v_body, '/insurance/' || v_pol.id::text);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;
