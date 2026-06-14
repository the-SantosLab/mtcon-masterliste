
-- Supplier invoice status
DO $$ BEGIN
  CREATE TYPE public.supplier_invoice_status AS ENUM ('open','matched','approved','rejected','booked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  supplier_invoice_no text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  gr_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  status public.supplier_invoice_status NOT NULL DEFAULT 'open',
  invoice_date date,
  due_date date,
  received_at timestamptz NOT NULL DEFAULT now(),
  currency text NOT NULL DEFAULT 'EUR',
  subtotal_amount numeric(14,2),
  tax_amount numeric(14,2),
  total_amount numeric(14,2),
  match_status text,
  match_diff numeric(14,2),
  notes text,
  attachment_path text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  booked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read supplier_invoices" ON public.supplier_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert supplier_invoices" ON public.supplier_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update supplier_invoices" ON public.supplier_invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete supplier_invoices" ON public.supplier_invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 1,
  art_nr text,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,4),
  tax_rate numeric(5,2) DEFAULT 19,
  line_total numeric(14,2),
  match_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_items TO authenticated;
GRANT ALL ON public.supplier_invoice_items TO service_role;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read supplier_invoice_items" ON public.supplier_invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write supplier_invoice_items" ON public.supplier_invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_si_po ON public.supplier_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_si_supplier ON public.supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_si_status ON public.supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sii_invoice ON public.supplier_invoice_items(invoice_id);

-- Counter trigger
CREATE OR REPLACE FUNCTION public.set_supplier_invoice_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y text; n int;
BEGIN
  IF NEW.invoice_no IS NOT NULL AND NEW.invoice_no <> '' THEN RETURN NEW; END IF;
  y := to_char(now(),'YYYY');
  INSERT INTO public.counters(key, value) VALUES ('supplier_invoice_'||y, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO n;
  NEW.invoice_no := 'ER-'||y||'-'||lpad(n::text,4,'0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_supplier_invoice_no ON public.supplier_invoices;
CREATE TRIGGER trg_set_supplier_invoice_no BEFORE INSERT ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_supplier_invoice_no();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_si_updated ON public.supplier_invoices;
CREATE TRIGGER trg_si_updated BEFORE UPDATE ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Match function: compares invoice items against PO ordered qty/price and goods receipts
CREATE OR REPLACE FUNCTION public.match_supplier_invoice(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.supplier_invoices%ROWTYPE;
  po_total numeric(14,2) := 0;
  gr_total numeric(14,3) := 0;
  inv_total numeric(14,2) := 0;
  diff numeric(14,2);
  ms text;
BEGIN
  SELECT * INTO inv FROM public.supplier_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not found'); END IF;

  inv_total := COALESCE(inv.total_amount, 0);

  IF inv.po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(qty_ordered * COALESCE(unit_price,0)), 0)
      INTO po_total FROM public.purchase_order_items WHERE po_id = inv.po_id;
    SELECT COALESCE(SUM(gri.qty_received), 0)
      INTO gr_total FROM public.goods_receipt_items gri
      JOIN public.goods_receipts gr ON gr.id = gri.gr_id
     WHERE gr.po_id = inv.po_id;
  END IF;

  -- Per-item match
  UPDATE public.supplier_invoice_items sii
     SET match_status = CASE
       WHEN sii.po_item_id IS NULL THEN 'unmatched'
       WHEN ABS(COALESCE(sii.unit_price,0) - COALESCE(poi.unit_price,0)) > 0.01 THEN 'price_diff'
       WHEN sii.quantity > COALESCE((SELECT SUM(qty_received) FROM public.goods_receipt_items WHERE po_item_id = sii.po_item_id),0) THEN 'qty_over_gr'
       ELSE 'ok'
     END
    FROM public.purchase_order_items poi
   WHERE sii.invoice_id = _invoice_id
     AND poi.id = sii.po_item_id;

  diff := COALESCE(inv_total,0) - COALESCE(po_total,0);
  IF inv.po_id IS NULL THEN
    ms := 'no_po';
  ELSIF ABS(diff) <= 0.5 THEN
    ms := 'ok';
  ELSE
    ms := 'amount_diff';
  END IF;

  UPDATE public.supplier_invoices
     SET match_status = ms,
         match_diff = diff,
         status = CASE WHEN status = 'open' AND ms = 'ok' THEN 'matched'::public.supplier_invoice_status ELSE status END
   WHERE id = _invoice_id;

  RETURN jsonb_build_object('match_status', ms, 'diff', diff, 'po_total', po_total, 'gr_total', gr_total, 'invoice_total', inv_total);
END $$;

GRANT EXECUTE ON FUNCTION public.match_supplier_invoice(uuid) TO authenticated;

-- Approval helper
CREATE OR REPLACE FUNCTION public.approve_supplier_invoice(_invoice_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _approve THEN
    UPDATE public.supplier_invoices
       SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
           rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
     WHERE id = _invoice_id;
  ELSE
    UPDATE public.supplier_invoices
       SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = _reason
     WHERE id = _invoice_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_supplier_invoice(uuid, boolean, text) TO authenticated;
