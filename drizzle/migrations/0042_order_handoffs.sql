CREATE TABLE public.order_handoff_rules (
  stage text PRIMARY KEY CHECK (stage IN ('einkauf','werkstatt','versand','rechnung')),
  label text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_handoff_rules TO authenticated;
GRANT ALL ON public.order_handoff_rules TO service_role;
ALTER TABLE public.order_handoff_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "handoff rules read" ON public.order_handoff_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY "handoff rules admin" ON public.order_handoff_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.order_handoff_rules(stage,label,department_id)
SELECT s.stage, s.label, d.id FROM (VALUES
  ('einkauf','Material prüfen und bestellen','b0000002-0000-0000-0000-000000000001'::uuid),
  ('werkstatt','Fertigung starten','a0000001-0000-0000-0000-000000000001'::uuid),
  ('versand','Lieferschein erstellen und versenden','b0000002-0000-0000-0000-000000000002'::uuid),
  ('rechnung','Rechnung erstellen','b0000004-0000-0000-0000-000000000002'::uuid)
) s(stage,label,dep) LEFT JOIN public.departments d ON d.id = s.dep;

CREATE TABLE public.order_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('einkauf','werkstatt','versand','rechnung')),
  title text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  trigger_event text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid,
  completed_reason text
);
CREATE UNIQUE INDEX order_handoffs_one_per_stage ON public.order_handoffs(order_id, stage);
CREATE INDEX order_handoffs_open ON public.order_handoffs(status, stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_handoffs TO authenticated;
GRANT ALL ON public.order_handoffs TO service_role;
ALTER TABLE public.order_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "handoffs read" ON public.order_handoffs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'viewer'));
CREATE POLICY "handoffs update" ON public.order_handoffs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "handoffs delete" ON public.order_handoffs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.open_order_handoff(_order_id uuid, _stage text, _event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.order_handoff_rules; o public.orders; hid uuid;
BEGIN
  SELECT * INTO r FROM public.order_handoff_rules WHERE stage = _stage;
  IF NOT FOUND OR NOT r.enabled THEN RETURN; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.order_handoffs(order_id, stage, title, department_id, trigger_event)
  VALUES (_order_id, _stage, r.label, r.department_id, _event)
  ON CONFLICT (order_id, stage) DO NOTHING RETURNING id INTO hid;
  IF hid IS NULL OR r.department_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, href)
  SELECT DISTINCT u.uid, 'order_handoff', 'Übergabe: ' || r.label,
    'Auftrag ' || o.order_no || coalesce(' – ' || o.customer_name, '') || ' wartet auf Ihren Bereich.',
    '/orders/' || o.id || '/akte'
  FROM (
    SELECT id AS uid FROM public.users_profile WHERE department_id = r.department_id AND coalesce(active,true)
    UNION SELECT user_id FROM public.department_members WHERE department_id = r.department_id
  ) u WHERE u.uid IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.close_order_handoff(_order_id uuid, _stage text, _reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.order_handoffs SET status='done', completed_at=now(), completed_by=auth.uid(), completed_reason=_reason
  WHERE order_id=_order_id AND stage=_stage AND status='open';
$$;

CREATE OR REPLACE FUNCTION public.trg_handoff_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM public.open_order_handoff(NEW.id, 'einkauf', 'Auftrag aktiviert');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_handoff_purchase_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.case_id IS NULL OR NEW.status::text <> 'received' OR OLD.status::text = 'received' THEN RETURN NEW; END IF;
  FOR o IN SELECT id FROM public.orders WHERE case_id = NEW.case_id LOOP
    IF EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.case_id = NEW.case_id AND p.id <> NEW.id AND p.status::text NOT IN ('received','cancelled')) THEN CONTINUE; END IF;
    PERFORM public.close_order_handoff(o.id, 'einkauf', 'Ware vollständig eingegangen');
    IF EXISTS (SELECT 1 FROM public.production_orders w WHERE w.order_id = o.id AND w.status NOT IN ('completed','cancelled')) THEN
      PERFORM public.open_order_handoff(o.id, 'werkstatt', 'Material eingegangen');
    ELSE
      PERFORM public.open_order_handoff(o.id, 'versand', 'Material eingegangen');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_handoff_production() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NULL OR NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.production_orders w WHERE w.order_id = NEW.order_id AND w.id <> NEW.id AND w.status NOT IN ('completed','cancelled')) THEN RETURN NEW; END IF;
  PERFORM public.close_order_handoff(NEW.order_id, 'werkstatt', 'Fertigung abgeschlossen');
  PERFORM public.open_order_handoff(NEW.order_id, 'versand', 'Fertigung abgeschlossen');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_handoff_deliveries() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NULL OR NEW.status <> 'shipped' OR (TG_OP='UPDATE' AND OLD.status = 'shipped') THEN RETURN NEW; END IF;
  PERFORM public.close_order_handoff(NEW.order_id, 'versand', 'Lieferschein versendet');
  PERFORM public.open_order_handoff(NEW.order_id, 'rechnung', 'Lieferschein versendet');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_handoff_invoices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND coalesce(NEW.doc_kind,'invoice') = 'invoice' THEN
    PERFORM public.close_order_handoff(NEW.order_id, 'rechnung', 'Rechnung erstellt');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER handoff_orders AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_handoff_orders();
CREATE TRIGGER handoff_purchase_orders AFTER UPDATE OF status ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.trg_handoff_purchase_orders();
CREATE TRIGGER handoff_production AFTER UPDATE OF status ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.trg_handoff_production();
CREATE TRIGGER handoff_deliveries AFTER INSERT OR UPDATE OF status ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.trg_handoff_deliveries();
CREATE TRIGGER handoff_invoices AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.trg_handoff_invoices();

REVOKE ALL ON FUNCTION public.open_order_handoff(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_order_handoff(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_handoff_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_handoff_purchase_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_handoff_production() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_handoff_deliveries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_handoff_invoices() FROM PUBLIC, anon, authenticated;