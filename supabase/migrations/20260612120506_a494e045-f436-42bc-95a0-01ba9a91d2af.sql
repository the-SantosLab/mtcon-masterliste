
-- Sequences for delivery/invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.deliveries_no_seq;
CREATE SEQUENCE IF NOT EXISTS public.invoices_no_seq;

CREATE OR REPLACE FUNCTION public.generate_delivery_no()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE yr text := to_char(now(), 'YYYY'); n bigint;
BEGIN
  n := nextval('public.deliveries_no_seq');
  RETURN 'LS-' || yr || '-' || lpad(n::text, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_no()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE yr text := to_char(now(), 'YYYY'); n bigint;
BEGIN
  n := nextval('public.invoices_no_seq');
  RETURN 'RE-' || yr || '-' || lpad(n::text, 4, '0');
END; $$;

-- DELIVERIES
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_no text NOT NULL UNIQUE DEFAULT generate_delivery_no(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shipped','cancelled')),
  delivery_date date,
  ship_to text,
  carrier text,
  tracking_no text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries read" ON public.deliveries FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff') OR has_role(auth.uid(),'viewer'));
CREATE POLICY "deliveries insert" ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "deliveries update" ON public.deliveries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "deliveries delete" ON public.deliveries FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DELIVERY ITEMS
CREATE TABLE public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 1,
  art_nr text,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  lot_no text,
  serial_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_items_delivery ON public.delivery_items(delivery_id);
CREATE INDEX idx_delivery_items_art_nr ON public.delivery_items(art_nr);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_items TO authenticated;
GRANT ALL ON public.delivery_items TO service_role;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_items read" ON public.delivery_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff') OR has_role(auth.uid(),'viewer'));
CREATE POLICY "delivery_items insert" ON public.delivery_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "delivery_items update" ON public.delivery_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "delivery_items delete" ON public.delivery_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));

-- INVOICES
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE DEFAULT generate_invoice_no(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','cancelled')),
  invoice_date date,
  due_date date,
  customer_name text,
  customer_email text,
  customer_no text,
  billing_address text,
  currency text NOT NULL DEFAULT 'EUR',
  subtotal_amount numeric(14,2),
  tax_amount numeric(14,2),
  total_amount numeric(14,2),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_at timestamptz,
  payment_terms text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_order ON public.invoices(order_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_customer_no ON public.invoices(customer_no);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff') OR has_role(auth.uid(),'viewer'));
CREATE POLICY "invoices insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "invoices update" ON public.invoices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "invoices delete" ON public.invoices FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INVOICE ITEMS
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 1,
  art_nr text,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,2),
  tax_rate numeric(5,2),
  line_total numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_art_nr ON public.invoice_items(art_nr);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items read" ON public.invoice_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff') OR has_role(auth.uid(),'viewer'));
CREATE POLICY "invoice_items insert" ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "invoice_items update" ON public.invoice_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
CREATE POLICY "invoice_items delete" ON public.invoice_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'staff'));
