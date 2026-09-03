-- 1) Lieferschein "versendet" bucht Lagerbestand serverseitig aus (idempotent) und verbraucht Reservierungen
CREATE OR REPLACE FUNCTION public.trg_delivery_ship_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; v_left numeric; res record;
BEGIN
  -- Versand: Ausbuchung
  IF NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped' THEN
    FOR it IN SELECT * FROM public.delivery_items WHERE delivery_id = NEW.id AND art_nr IS NOT NULL AND warehouse_id IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM public.stock_movements
                     WHERE reference_type = 'delivery' AND reference_id = NEW.id AND art_nr = it.art_nr
                       AND warehouse_id = it.warehouse_id AND movement_type = 'outbound') THEN
        INSERT INTO public.stock_movements(art_nr, warehouse_id, movement_type, quantity, order_id, reference_type, reference_id, note, lot_no, serial_no, created_by)
        VALUES (it.art_nr, it.warehouse_id, 'outbound', it.quantity, NEW.order_id, 'delivery', NEW.id,
                'Lieferschein ' || COALESCE(NEW.delivery_no, ''), it.lot_no, it.serial_no, COALESCE(auth.uid(), NEW.created_by));
      END IF;
      -- Reservierungen des Auftrags für diesen Artikel verbrauchen
      v_left := it.quantity;
      FOR res IN SELECT id, quantity FROM public.stock_reservations
                 WHERE order_id = NEW.order_id AND art_nr = it.art_nr AND status = 'open'
                 ORDER BY created_at LOOP
        EXIT WHEN v_left <= 0;
        IF res.quantity <= v_left THEN
          UPDATE public.stock_reservations SET status = 'fulfilled', updated_at = now() WHERE id = res.id;
          v_left := v_left - res.quantity;
        ELSE
          UPDATE public.stock_reservations SET quantity = quantity - v_left, updated_at = now() WHERE id = res.id;
          v_left := 0;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  -- Storno nach Versand: Rückbuchung
  IF NEW.status = 'cancelled' AND OLD.status = 'shipped' THEN
    FOR it IN SELECT * FROM public.delivery_items WHERE delivery_id = NEW.id AND art_nr IS NOT NULL AND warehouse_id IS NOT NULL LOOP
      IF NOT EXISTS (SELECT 1 FROM public.stock_movements
                     WHERE reference_type = 'delivery_cancel' AND reference_id = NEW.id AND art_nr = it.art_nr AND warehouse_id = it.warehouse_id) THEN
        INSERT INTO public.stock_movements(art_nr, warehouse_id, movement_type, quantity, order_id, reference_type, reference_id, note, lot_no, serial_no, created_by)
        VALUES (it.art_nr, it.warehouse_id, 'inbound', it.quantity, NEW.order_id, 'delivery_cancel', NEW.id,
                'Storno Lieferschein ' || COALESCE(NEW.delivery_no, ''), it.lot_no, it.serial_no, COALESCE(auth.uid(), NEW.created_by));
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_delivery_ship_stock ON public.deliveries;
CREATE TRIGGER trg_delivery_ship_stock AFTER UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.trg_delivery_ship_stock();

-- 2) Automatische Sperre: Rechnung bei Versand, Lieferschein bei Versand (Revisionssicherheit)
CREATE OR REPLACE FUNCTION public.trg_erp_autolock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target text := TG_ARGV[0];
BEGIN
  IF NEW.status = v_target AND COALESCE(NEW.locked, false) = false
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.locked := true;
    NEW.locked_at := COALESCE(NEW.locked_at, now());
    NEW.locked_by := COALESCE(NEW.locked_by, auth.uid(), NEW.created_by);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_autolock ON public.invoices;
CREATE TRIGGER trg_invoice_autolock BEFORE INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_erp_autolock('sent');

DROP TRIGGER IF EXISTS trg_delivery_autolock ON public.deliveries;
CREATE TRIGGER trg_delivery_autolock BEFORE INSERT OR UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.trg_erp_autolock('shipped');

-- Bereits versendete Belege nachträglich sperren
UPDATE public.invoices SET locked = true, locked_at = COALESCE(locked_at, now()) WHERE status IN ('sent','paid') AND COALESCE(locked,false) = false;
UPDATE public.deliveries SET locked = true, locked_at = COALESCE(locked_at, now()) WHERE status = 'shipped' AND COALESCE(locked,false) = false;

-- 3) Rechnungsstatus mit Zahlungsstatus synchronisieren (sent <-> paid)
CREATE OR REPLACE FUNCTION public.invoice_recalc_payments(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sum numeric(14,2); v_last timestamptz; v_total numeric(14,2); v_due date; v_kind text; v_status text; v_new_status text;
BEGIN
  SELECT COALESCE(SUM(amount),0), MAX(paid_on)::timestamptz INTO v_sum, v_last
    FROM public.invoice_payments WHERE invoice_id = p_invoice_id;
  SELECT total_amount, due_date, doc_kind, status INTO v_total, v_due, v_kind, v_status
    FROM public.invoices WHERE id = p_invoice_id;

  IF v_kind IN ('credit_note','storno') THEN v_new_status := 'cancelled';
  ELSIF v_total IS NULL OR v_total = 0 THEN v_new_status := 'open';
  ELSIF v_sum >= v_total THEN v_new_status := 'paid';
  ELSIF v_sum > 0 THEN v_new_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN v_new_status := 'overdue';
  ELSE v_new_status := 'open';
  END IF;

  UPDATE public.invoices
     SET paid_amount = v_sum,
         paid_at = CASE WHEN v_new_status = 'paid' THEN v_last ELSE NULL END,
         payment_status = v_new_status,
         status = CASE
                    WHEN v_new_status = 'paid' AND v_status IN ('sent','draft') THEN 'paid'
                    WHEN v_new_status <> 'paid' AND v_status = 'paid' THEN 'sent'
                    ELSE v_status END,
         updated_at = now()
   WHERE id = p_invoice_id;
END $$;

-- 4) Deal-Stufe folgt dem Angebot: versendet -> angebot_versendet (nur wenn noch früher im Funnel)
CREATE OR REPLACE FUNCTION public.crm_offer_sent_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    UPDATE public.deals SET stage = 'angebot_versendet', stage_changed_at = now()
     WHERE id = NEW.deal_id AND stage IN ('anfrage','qualifikation');
  END IF;
  RETURN NEW;
END $$;