CREATE TABLE public.production_completion_requests (
  request_id uuid PRIMARY KEY,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  result jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.production_completion_requests TO authenticated;
GRANT ALL ON public.production_completion_requests TO service_role;
ALTER TABLE public.production_completion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read completion requests" ON public.production_completion_requests
  FOR SELECT TO authenticated USING (public.is_internal_user());

CREATE OR REPLACE FUNCTION public.scan_production_complete(_id uuid, _qty numeric, _expected_done numeric, _request_id uuid, _lot_no text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE wo public.production_orders; prev jsonb; res jsonb;
BEGIN
  IF NOT public.is_internal_user() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF _request_id IS NULL THEN RAISE EXCEPTION 'Meldungs-ID fehlt'; END IF;
  SELECT result INTO prev FROM public.production_completion_requests WHERE request_id = _request_id;
  IF FOUND THEN RETURN coalesce(prev,'{}'::jsonb) || jsonb_build_object('duplicate', true); END IF;
  SELECT * INTO wo FROM public.production_orders WHERE id = _id FOR UPDATE;
  IF wo.id IS NULL THEN RAISE EXCEPTION 'Werkstattauftrag nicht gefunden'; END IF;
  IF wo.quantity_done IS DISTINCT FROM _expected_done THEN
    RAISE EXCEPTION 'Zwischenzeitlich bereits gemeldet (jetzt % von %). Bitte neu scannen.', wo.quantity_done, wo.quantity;
  END IF;
  res := public.production_order_complete(_id, _qty, _lot_no);
  INSERT INTO public.production_completion_requests(request_id, production_order_id, qty, result, created_by)
  VALUES (_request_id, _id, _qty, res, auth.uid());
  RETURN res || jsonb_build_object('duplicate', false);
END; $$;
REVOKE ALL ON FUNCTION public.scan_production_complete(uuid,numeric,numeric,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.scan_production_complete(uuid,numeric,numeric,uuid,text) TO authenticated;