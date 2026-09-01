-- 1) Sperr-Trigger feldunabhängig machen (griff auf nicht existierende Spalten zu)
CREATE OR REPLACE FUNCTION public.enforce_erp_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text := TG_ARGV[0];
  v_admin boolean := COALESCE(public.is_admin(), false);
  jn jsonb;
  jo jsonb;
  v_no text;
  v_no_key text := CASE v_kind
    WHEN 'invoice' THEN 'invoice_no'
    WHEN 'offer' THEN 'offer_no'
    WHEN 'order' THEN 'order_no'
    WHEN 'delivery' THEN 'delivery_no'
    WHEN 'purchase_order' THEN 'po_no'
  END;
  v_guard text[] := CASE v_kind
    WHEN 'invoice' THEN ARRAY['invoice_no','invoice_date','customer_name','total_amount','subtotal_amount','tax_amount','tax_mode','currency']
    WHEN 'offer' THEN ARRAY['offer_no','total','total_amount']
    WHEN 'order' THEN ARRAY['order_no','customer_name','total_amount']
    WHEN 'delivery' THEN ARRAY['delivery_no','order_id']
    WHEN 'purchase_order' THEN ARRAY['po_no','total_amount']
    ELSE ARRAY[]::text[]
  END;
  k text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    jo := to_jsonb(OLD);
    IF COALESCE((jo->>'locked')::boolean, false) AND NOT v_admin THEN
      v_no := jo->>v_no_key;
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, note)
      VALUES (v_kind, OLD.id, v_no, 'deleted_blocked', auth.uid(), public._erp_actor_name(auth.uid()),
              'Löschversuch auf gesperrten Beleg verhindert');
      RAISE EXCEPTION 'Beleg ist gesperrt und kann nicht gelöscht werden. Bitte Storno/Gutschrift erzeugen.';
    END IF;
    RETURN OLD;
  END IF;

  jo := to_jsonb(OLD);
  jn := to_jsonb(NEW);

  IF COALESCE((jo->>'locked')::boolean, false) AND NOT v_admin THEN
    FOREACH k IN ARRAY v_guard LOOP
      IF jo ? k AND (jn->>k) IS DISTINCT FROM (jo->>k) THEN
        RAISE EXCEPTION 'Beleg % ist gesperrt. Änderungen nur per Storno/Gutschrift möglich.', COALESCE(jo->>v_no_key, '');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Doppelte Zählung der Liefermengen entfernen:
-- recalc_order_item_progress berechnet bereits vollständig neu,
-- process_delivery_shipped hat zusätzlich addiert.
DROP TRIGGER IF EXISTS trg_process_delivery_shipped ON public.deliveries;