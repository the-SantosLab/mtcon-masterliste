ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard';
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check CHECK (invoice_type IN ('standard','partial','final'));
CREATE INDEX IF NOT EXISTS idx_invoices_order_type ON public.invoices(order_id, invoice_type);

-- Partial invoices are not the billing step; only standard/final invoices close the billing handoff.
CREATE OR REPLACE FUNCTION public.trg_handoff_invoices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND coalesce(NEW.doc_kind,'invoice') = 'invoice' AND coalesce(NEW.invoice_type,'standard') <> 'partial' THEN
    PERFORM public.close_order_handoff(NEW.order_id, 'rechnung', 'Rechnung erstellt');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._order_net_tax(_order_id uuid, OUT net numeric, OUT tax numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(coalesce(line_total, quantity*coalesce(unit_price,0))),0),
         coalesce(sum(coalesce(line_total, quantity*coalesce(unit_price,0)) * coalesce(tax_rate,19)/100),0)
  FROM public.order_items WHERE order_id = _order_id
$$;
REVOKE ALL ON FUNCTION public._order_net_tax(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._guard_invoice_writer() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_internal_user()
     OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung für Rechnungen';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._guard_invoice_writer() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.create_partial_invoice(_order_id uuid, _percent numeric DEFAULT NULL, _net_amount numeric DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; t record; billed numeric; n int; net numeric; rate numeric; inv uuid;
BEGIN
  PERFORM public._guard_invoice_writer();
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auftrag nicht gefunden'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Auftrag ist storniert'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id=_order_id AND invoice_type='final' AND status<>'cancelled') THEN
    RAISE EXCEPTION 'Schlussrechnung existiert bereits'; END IF;
  SELECT * INTO t FROM public._order_net_tax(_order_id);
  IF t.net <= 0 THEN RAISE EXCEPTION 'Auftrag hat keinen Positionswert'; END IF;
  IF (_percent IS NULL) = (_net_amount IS NULL) THEN RAISE EXCEPTION 'Prozentsatz oder Nettobetrag angeben'; END IF;
  net := round(coalesce(_net_amount, t.net * _percent / 100), 2);
  IF net <= 0 THEN RAISE EXCEPTION 'Betrag muss größer 0 sein'; END IF;
  SELECT coalesce(sum(subtotal_amount),0), count(*) INTO billed, n FROM public.invoices
    WHERE order_id=_order_id AND invoice_type='partial' AND doc_kind='invoice' AND status<>'cancelled';
  IF billed + net > t.net + 0.005 THEN
    RAISE EXCEPTION 'Abschläge (% €) würden den Auftragswert (% €) übersteigen', billed + net, round(t.net,2); END IF;
  rate := round(t.tax / t.net * 100, 2);
  INSERT INTO public.invoices(order_id, company_id, status, doc_kind, invoice_type, invoice_date, payment_terms_days, tax_mode,
    customer_name, customer_email, customer_no, currency, subtotal_amount, tax_amount, total_amount, notes, created_by)
  VALUES (_order_id, o.company_id, 'draft', 'invoice', 'partial', current_date, 14, 'standard',
    o.customer_name, o.customer_email, o.customer_no, 'EUR', net, round(net*rate/100,2), net + round(net*rate/100,2), _note, auth.uid())
  RETURNING id INTO inv;
  INSERT INTO public.invoice_items(invoice_id, position, description, quantity, unit, unit_price, tax_rate, line_total)
  VALUES (inv, 1, format('%s. Abschlagsrechnung zu Auftrag %s (%s %% des Auftragswerts)', n+1, o.order_no, round(net/t.net*100,2)), 1, 'pauschal', net, rate, net);
  RETURN inv;
END $$;

CREATE OR REPLACE FUNCTION public.create_final_invoice(_order_id uuid, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; t record; p record; inv uuid; pos int := 0; dnet numeric := 0; dtax numeric := 0;
BEGIN
  PERFORM public._guard_invoice_writer();
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auftrag nicht gefunden'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id=_order_id AND invoice_type='final' AND status<>'cancelled') THEN
    RAISE EXCEPTION 'Schlussrechnung existiert bereits'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id=_order_id AND invoice_type='partial' AND status='draft') THEN
    RAISE EXCEPTION 'Erst offene Abschlagsentwürfe versenden oder löschen'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE order_id=_order_id AND invoice_type='partial' AND status<>'cancelled') THEN
    RAISE EXCEPTION 'Keine Abschlagsrechnung vorhanden – normale Rechnung verwenden'; END IF;
  SELECT * INTO t FROM public._order_net_tax(_order_id);
  INSERT INTO public.invoices(order_id, company_id, status, doc_kind, invoice_type, invoice_date, payment_terms_days, tax_mode,
    customer_name, customer_email, customer_no, currency, subtotal_amount, tax_amount, total_amount, notes, created_by)
  VALUES (_order_id, o.company_id, 'draft', 'invoice', 'final', current_date, 14, 'standard',
    o.customer_name, o.customer_email, o.customer_no, 'EUR', 0, 0, 0, _note, auth.uid())
  RETURNING id INTO inv;
  INSERT INTO public.invoice_items(invoice_id, position, art_nr, description, quantity, unit, unit_price, tax_rate, line_total, order_item_id)
  SELECT inv, row_number() OVER (ORDER BY position), art_nr, description, quantity, unit, unit_price, coalesce(tax_rate,19),
         coalesce(line_total, quantity*coalesce(unit_price,0)), id
  FROM public.order_items WHERE order_id = _order_id;
  SELECT count(*) INTO pos FROM public.invoice_items WHERE invoice_id = inv;
  FOR p IN SELECT * FROM public.invoices WHERE order_id=_order_id AND invoice_type='partial' AND doc_kind='invoice' AND status<>'cancelled' ORDER BY invoice_date, created_at LOOP
    pos := pos + 1;
    INSERT INTO public.invoice_items(invoice_id, position, description, quantity, unit, unit_price, tax_rate, line_total)
    VALUES (inv, pos, format('abzgl. Abschlagsrechnung %s vom %s', p.invoice_no, to_char(p.invoice_date,'DD.MM.YYYY')), 1, 'pauschal',
            -p.subtotal_amount, CASE WHEN p.subtotal_amount <> 0 THEN round(p.tax_amount/p.subtotal_amount*100,2) ELSE 0 END, -p.subtotal_amount);
    dnet := dnet + coalesce(p.subtotal_amount,0); dtax := dtax + coalesce(p.tax_amount,0);
  END LOOP;
  UPDATE public.invoices SET subtotal_amount = round(t.net - dnet,2), tax_amount = round(t.tax - dtax,2),
    total_amount = round(t.net - dnet,2) + round(t.tax - dtax,2) WHERE id = inv;
  RETURN inv;
END $$;

REVOKE ALL ON FUNCTION public.create_partial_invoice(uuid, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_final_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partial_invoice(uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_final_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._guard_invoice_writer() TO authenticated;