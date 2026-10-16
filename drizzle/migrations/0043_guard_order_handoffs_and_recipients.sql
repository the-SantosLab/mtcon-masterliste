CREATE OR REPLACE FUNCTION public.guard_order_handoff_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN
      RAISE EXCEPTION 'Übergabe darf nicht bearbeitet werden' USING ERRCODE='42501';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','completed_at','completed_by','completed_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','completed_at','completed_by','completed_reason']) OR OLD.status <> 'open' OR NEW.status <> 'done' THEN
      RAISE EXCEPTION 'Übergaben können nur als erledigt markiert werden' USING ERRCODE='42501';
    END IF;
    NEW.completed_at := now();
    NEW.completed_by := auth.uid();
    NEW.completed_reason := 'Manuell erledigt';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_order_handoff_update BEFORE UPDATE ON public.order_handoffs FOR EACH ROW EXECUTE FUNCTION public.guard_order_handoff_update();
REVOKE ALL ON FUNCTION public.guard_order_handoff_update() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.open_order_handoff(_order_id uuid, _stage text, _event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.order_handoff_rules; o public.orders; hid uuid;
BEGIN
  SELECT * INTO r FROM public.order_handoff_rules WHERE stage = _stage;
  IF NOT FOUND OR NOT r.enabled THEN RETURN; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR o.status = 'cancelled' THEN RETURN; END IF;
  INSERT INTO public.order_handoffs(order_id, stage, title, department_id, trigger_event)
  VALUES (_order_id, _stage, r.label, r.department_id, _event)
  ON CONFLICT (order_id, stage) DO NOTHING RETURNING id INTO hid;
  IF hid IS NULL OR r.department_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, href)
  SELECT DISTINCT p.id, 'order_handoff', 'Übergabe: ' || r.label,
    'Auftrag ' || o.order_no || coalesce(' – ' || o.customer_name, '') || ' wartet auf Ihren Bereich.',
    '/orders/' || o.id || '/akte'
  FROM public.users_profile p
  WHERE p.active AND (p.department_id = r.department_id OR EXISTS (
    SELECT 1 FROM public.department_members m WHERE m.user_id = p.id AND m.department_id = r.department_id
  )) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin','staff'));
END $$;
REVOKE ALL ON FUNCTION public.open_order_handoff(uuid,text,text) FROM PUBLIC, anon, authenticated;