-- 1) Maintenance jobs: only server/cron, never callable from the app
REVOKE EXECUTE ON FUNCTION public.purge_old_trashed_notes(), public.purge_trashed_cases(), public.purge_old_trashed_boards(),
  public.archive_old_announcements(), public.mark_invoices_overdue(), public.generate_insurance_reminders(),
  public.check_po_delays(), public.next_counter(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_trashed_notes(), public.purge_trashed_cases(), public.purge_old_trashed_boards(),
  public.archive_old_announcements(), public.mark_invoices_overdue(), public.generate_insurance_reminders(),
  public.check_po_delays(), public.next_counter(text) TO service_role;

-- 2) Supplier invoice approval: staff or admin only, only from open/matched
CREATE OR REPLACE FUNCTION public.approve_supplier_invoice(_invoice_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF _approve THEN
    UPDATE public.supplier_invoices SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
      rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
     WHERE id = _invoice_id AND status IN ('open','matched');
  ELSE
    UPDATE public.supplier_invoices SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = _reason
     WHERE id = _invoice_id AND status IN ('open','matched');
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rechnung ist nicht offen'; END IF;
END $$;

-- 3) Direct client writes on supplier invoices may not set approval/match results
CREATE OR REPLACE FUNCTION public.guard_supplier_invoice_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF NOT public.has_role(auth.uid(),'staff') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open'; NEW.match_status := NULL; NEW.match_diff := NULL;
    NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.rejected_by := NULL; NEW.rejected_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'approved' AND NEW.status = 'booked') THEN
    RAISE EXCEPTION 'Status nur über Abgleich, Freigabe oder Buchung änderbar';
  END IF;
  IF NEW.match_status IS DISTINCT FROM OLD.match_status OR NEW.match_diff IS DISTINCT FROM OLD.match_diff
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at THEN
    RAISE EXCEPTION 'Freigabe- und Abgleichsfelder sind geschützt';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_supplier_invoice_write BEFORE INSERT OR UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_invoice_write();

-- 4) Stock quantities change only through stock movements (admins may correct)
CREATE OR REPLACE FUNCTION public.guard_inventory_stock_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') OR public.has_role(auth.uid(),'admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bestand nur über Lagerbewegungen änderbar'; END IF;
  IF TG_OP = 'INSERT' AND COALESCE(NEW.quantity,0) <> 0 THEN RAISE EXCEPTION 'Bestand nur über Lagerbewegungen änderbar'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN RAISE EXCEPTION 'Bestand nur über Lagerbewegungen änderbar'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_inventory_stock_write BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_stock_write();