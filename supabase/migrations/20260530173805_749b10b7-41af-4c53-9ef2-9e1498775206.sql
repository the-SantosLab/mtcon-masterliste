-- Schritt 2: Bestellungs-Intake per E-Mail

CREATE SEQUENCE IF NOT EXISTS public.orders_no_seq;

CREATE OR REPLACE FUNCTION public.generate_order_no()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  yr text := to_char(now(), 'YYYY');
  n bigint;
BEGIN
  n := nextval('public.orders_no_seq');
  RETURN 'ORD-' || yr || '-' || lpad(n::text, 4, '0');
END;
$$;

-- orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text UNIQUE NOT NULL DEFAULT public.generate_order_no(),
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  order_kind text NOT NULL DEFAULT 'new',
  customer_name text,
  customer_email text,
  customer_no text,
  external_order_no text,
  order_date date,
  delivery_date date,
  payment_terms text,
  currency text NOT NULL DEFAULT 'EUR',
  subtotal_amount numeric(14,2),
  tax_amount numeric(14,2),
  total_amount numeric(14,2),
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  assigned_to uuid,
  department_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_check CHECK (status IN ('draft','active','in_progress','completed','cancelled')),
  CONSTRAINT orders_kind_check CHECK (order_kind IN ('new','change','cancellation','other'))
);

CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_customer_no ON public.orders(customer_no);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders read" ON public.orders FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'viewer'::app_role)
  );

CREATE POLICY "orders insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "orders update" ON public.orders FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "orders delete" ON public.orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- order_items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 1,
  sku text,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,2),
  line_total numeric(14,2),
  tax_rate numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items read" ON public.order_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'viewer'::app_role)
  );

CREATE POLICY "order_items write" ON public.order_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- order_documents
CREATE TABLE public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  doc_kind text DEFAULT 'order',
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_documents_order_id ON public.order_documents(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_documents TO authenticated;
GRANT ALL ON public.order_documents TO service_role;

ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_documents read" ON public.order_documents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR public.has_role(auth.uid(), 'viewer'::app_role)
  );

CREATE POLICY "order_documents write" ON public.order_documents FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- order_intake_corrections
CREATE TABLE public.order_intake_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  field text NOT NULL,
  ai_value jsonb,
  corrected_value jsonb,
  corrected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_intake_corrections_order_id ON public.order_intake_corrections(order_id);

GRANT SELECT, INSERT ON public.order_intake_corrections TO authenticated;
GRANT ALL ON public.order_intake_corrections TO service_role;

ALTER TABLE public.order_intake_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_corrections read" ON public.order_intake_corrections FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "order_corrections insert" ON public.order_intake_corrections FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-documents', 'order-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "order-documents read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-documents' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'staff'::app_role)
      OR public.has_role(auth.uid(), 'viewer'::app_role)
    )
  );

CREATE POLICY "order-documents write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-documents' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'staff'::app_role)
    )
  );

CREATE POLICY "order-documents delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'order-documents' AND public.has_role(auth.uid(), 'admin'::app_role)
  );