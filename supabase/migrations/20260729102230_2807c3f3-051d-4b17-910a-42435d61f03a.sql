
ALTER TABLE public.offers          ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.offers          ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.offers          ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE public.deliveries      ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.deliveries      ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.deliveries      ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS locked_by uuid;
ALTER TABLE public.invoices        ADD COLUMN IF NOT EXISTS locked_by uuid;

CREATE TABLE IF NOT EXISTS public.erp_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_no text,
  action text NOT NULL,
  actor_id uuid,
  actor_name text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_activity_entity_idx ON public.erp_activity(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS erp_activity_created_idx ON public.erp_activity(created_at DESC);

GRANT SELECT ON public.erp_activity TO authenticated;
GRANT ALL    ON public.erp_activity TO service_role;
ALTER TABLE public.erp_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_activity_read" ON public.erp_activity;
CREATE POLICY "erp_activity_read" ON public.erp_activity
  FOR SELECT TO authenticated
  USING (public.has_erp_access(auth.uid()) OR public.is_admin());

CREATE OR REPLACE FUNCTION public._erp_actor_name(uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(p.display_name,''), NULLIF(p.short_code,''))
  FROM public.users_profile p WHERE p.id = uid
$$;

CREATE OR REPLACE FUNCTION public.enforce_erp_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_no text;
  v_admin boolean := COALESCE(public.is_admin(), false);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.locked, false) AND NOT v_admin THEN
      v_no := CASE v_kind
        WHEN 'invoice' THEN OLD.invoice_no
        WHEN 'offer' THEN OLD.offer_no
        WHEN 'order' THEN OLD.order_no
        WHEN 'delivery' THEN OLD.delivery_no
        WHEN 'purchase_order' THEN OLD.po_no
      END;
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, note)
      VALUES (v_kind, OLD.id, v_no, 'deleted_blocked', auth.uid(), public._erp_actor_name(auth.uid()),
              'Löschversuch auf gesperrten Beleg verhindert');
      RAISE EXCEPTION 'Beleg ist gesperrt und kann nicht gelöscht werden. Bitte Storno/Gutschrift erzeugen.';
    END IF;
    RETURN OLD;
  END IF;

  IF COALESCE(OLD.locked, false) AND NOT v_admin THEN
    IF v_kind = 'invoice' THEN
      IF NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.tax_mode IS DISTINCT FROM OLD.tax_mode
      OR NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'Rechnung % ist gesperrt. Änderungen nur per Storno/Gutschrift möglich.', OLD.invoice_no;
      END IF;
    ELSIF v_kind = 'offer' THEN
      IF NEW.offer_no IS DISTINCT FROM OLD.offer_no
      OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Angebot % ist gesperrt.', OLD.offer_no;
      END IF;
    ELSIF v_kind = 'order' THEN
      IF NEW.order_no IS DISTINCT FROM OLD.order_no
      OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Auftrag % ist gesperrt.', OLD.order_no;
      END IF;
    ELSIF v_kind = 'delivery' THEN
      IF NEW.delivery_no IS DISTINCT FROM OLD.delivery_no
      OR NEW.customer_name IS DISTINCT FROM OLD.customer_name THEN
        RAISE EXCEPTION 'Lieferschein % ist gesperrt.', OLD.delivery_no;
      END IF;
    ELSIF v_kind = 'purchase_order' THEN
      IF NEW.po_no IS DISTINCT FROM OLD.po_no
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Bestellung % ist gesperrt.', OLD.po_no;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_erp_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_uid uuid := auth.uid();
  v_name text := public._erp_actor_name(auth.uid());
  v_no text;
  v_action text;
BEGIN
  v_no := CASE v_kind
    WHEN 'invoice' THEN COALESCE(NEW.invoice_no, OLD.invoice_no)
    WHEN 'offer' THEN COALESCE(NEW.offer_no, OLD.offer_no)
    WHEN 'order' THEN COALESCE(NEW.order_no, OLD.order_no)
    WHEN 'delivery' THEN COALESCE(NEW.delivery_no, OLD.delivery_no)
    WHEN 'purchase_order' THEN COALESCE(NEW.po_no, OLD.po_no)
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, after)
    VALUES (v_kind, NEW.id, v_no, 'created', v_uid, v_name,
            jsonb_build_object('status', to_jsonb(NEW)->'status', 'total', to_jsonb(NEW)->'total_amount'));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.locked,false) IS DISTINCT FROM COALESCE(OLD.locked,false) THEN
      v_action := CASE WHEN NEW.locked THEN 'locked' ELSE 'unlocked' END;
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name)
      VALUES (v_kind, NEW.id, v_no, v_action, v_uid, v_name);
    END IF;

    IF to_jsonb(NEW)->>'status' IS DISTINCT FROM to_jsonb(OLD)->>'status' THEN
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, before, after)
      VALUES (v_kind, NEW.id, v_no, 'status_changed', v_uid, v_name,
              jsonb_build_object('status', to_jsonb(OLD)->>'status'),
              jsonb_build_object('status', to_jsonb(NEW)->>'status'));
    END IF;

    IF v_kind = 'invoice' AND to_jsonb(NEW)->>'payment_status' IS DISTINCT FROM to_jsonb(OLD)->>'payment_status' THEN
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, before, after)
      VALUES (v_kind, NEW.id, v_no,
              CASE WHEN NEW.payment_status = 'paid' THEN 'paid' ELSE 'payment_status_changed' END,
              v_uid, v_name,
              jsonb_build_object('payment_status', OLD.payment_status, 'paid_amount', OLD.paid_amount),
              jsonb_build_object('payment_status', NEW.payment_status, 'paid_amount', NEW.paid_amount));
    END IF;

    IF to_jsonb(NEW)->>'total_amount' IS DISTINCT FROM to_jsonb(OLD)->>'total_amount' THEN
      INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, before, after)
      VALUES (v_kind, NEW.id, v_no, 'amount_changed', v_uid, v_name,
              jsonb_build_object('total', to_jsonb(OLD)->>'total_amount'),
              jsonb_build_object('total', to_jsonb(NEW)->>'total_amount'));
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('invoices','invoice'),
    ('offers','offer'),
    ('orders','order'),
    ('deliveries','delivery'),
    ('purchase_orders','purchase_order')
  ) AS x(tbl, kind) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_enforce_lock ON public.%I', t.kind, t.tbl);
    EXECUTE format('CREATE TRIGGER trg_%s_enforce_lock BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_erp_lock(%L)', t.kind, t.tbl, t.kind);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_audit ON public.%I', t.kind, t.tbl);
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_erp_activity(%L)', t.kind, t.tbl, t.kind);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.lock_erp_document(_kind text, _id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_updated int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_erp_access(v_uid) OR public.is_admin()) THEN
    RAISE EXCEPTION 'no erp access';
  END IF;

  IF _kind = 'invoice' THEN
    UPDATE public.invoices SET locked=true, locked_at=COALESCE(locked_at, now()), locked_by=COALESCE(locked_by, v_uid)
      WHERE id=_id AND COALESCE(locked,false)=false;
  ELSIF _kind = 'offer' THEN
    UPDATE public.offers SET locked=true, locked_at=COALESCE(locked_at, now()), locked_by=COALESCE(locked_by, v_uid)
      WHERE id=_id AND COALESCE(locked,false)=false;
  ELSIF _kind = 'order' THEN
    UPDATE public.orders SET locked=true, locked_at=COALESCE(locked_at, now()), locked_by=COALESCE(locked_by, v_uid)
      WHERE id=_id AND COALESCE(locked,false)=false;
  ELSIF _kind = 'delivery' THEN
    UPDATE public.deliveries SET locked=true, locked_at=COALESCE(locked_at, now()), locked_by=COALESCE(locked_by, v_uid)
      WHERE id=_id AND COALESCE(locked,false)=false;
  ELSIF _kind = 'purchase_order' THEN
    UPDATE public.purchase_orders SET locked=true, locked_at=COALESCE(locked_at, now()), locked_by=COALESCE(locked_by, v_uid)
      WHERE id=_id AND COALESCE(locked,false)=false;
  ELSE
    RAISE EXCEPTION 'unknown kind %', _kind;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_erp_document(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_erp_document(_kind text, _id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_no text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;

  IF _kind = 'invoice' THEN
    UPDATE public.invoices SET locked=false WHERE id=_id RETURNING invoice_no INTO v_no;
  ELSIF _kind = 'offer' THEN
    UPDATE public.offers SET locked=false WHERE id=_id RETURNING offer_no INTO v_no;
  ELSIF _kind = 'order' THEN
    UPDATE public.orders SET locked=false WHERE id=_id RETURNING order_no INTO v_no;
  ELSIF _kind = 'delivery' THEN
    UPDATE public.deliveries SET locked=false WHERE id=_id RETURNING delivery_no INTO v_no;
  ELSIF _kind = 'purchase_order' THEN
    UPDATE public.purchase_orders SET locked=false WHERE id=_id RETURNING po_no INTO v_no;
  ELSE
    RAISE EXCEPTION 'unknown kind %', _kind;
  END IF;

  INSERT INTO public.erp_activity(entity_type, entity_id, entity_no, action, actor_id, actor_name, note)
  VALUES (_kind, _id, v_no, 'unlocked', v_uid, public._erp_actor_name(v_uid), _reason);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_erp_document(text, uuid, text) TO authenticated;
