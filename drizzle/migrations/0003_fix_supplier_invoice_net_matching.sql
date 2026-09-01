-- Rechnungsprüfung verglich Brutto-Rechnung mit Netto-Bestellwert -> immer "amount_diff"
CREATE OR REPLACE FUNCTION public.match_supplier_invoice(_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Netto vergleichen (Bestellpositionen sind netto)
  inv_total := COALESCE(inv.subtotal_amount, COALESCE(inv.total_amount,0) - COALESCE(inv.tax_amount,0));

  IF inv.po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(qty_ordered * COALESCE(unit_price,0)), 0)
      INTO po_total FROM public.purchase_order_items WHERE po_id = inv.po_id;
    SELECT COALESCE(SUM(gri.qty_received), 0)
      INTO gr_total FROM public.goods_receipt_items gri
      JOIN public.goods_receipts gr ON gr.id = gri.gr_id
     WHERE gr.po_id = inv.po_id;
  END IF;

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

  RETURN jsonb_build_object('match_status', ms, 'diff', diff, 'po_total', po_total, 'gr_total', gr_total, 'invoice_net', inv_total);
END $function$;