
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS tracking_pushed_at timestamptz;

CREATE OR REPLACE FUNCTION public.build_tracking_url(_carrier text, _tracking_no text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c text;
  t text;
BEGIN
  IF _tracking_no IS NULL OR length(trim(_tracking_no)) = 0 THEN RETURN NULL; END IF;
  t := trim(_tracking_no);
  c := lower(coalesce(_carrier, ''));
  IF c LIKE '%dhl%' THEN
    RETURN 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=' || t;
  ELSIF c LIKE '%ups%' THEN
    RETURN 'https://www.ups.com/track?tracknum=' || t;
  ELSIF c LIKE '%dpd%' THEN
    RETURN 'https://tracking.dpd.de/status/de_DE/parcel/' || t;
  ELSIF c LIKE '%gls%' THEN
    RETURN 'https://gls-group.com/DE/de/paketverfolgung?match=' || t;
  ELSIF c LIKE '%fedex%' THEN
    RETURN 'https://www.fedex.com/fedextrack/?trknbr=' || t;
  ELSIF c LIKE '%tnt%' THEN
    RETURN 'https://www.tnt.com/express/de_de/site/shipping-tools/tracking.html?searchType=con&cons=' || t;
  ELSIF c LIKE '%hermes%' THEN
    RETURN 'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#' || t;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_delivery_tracking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_recipient uuid;
  v_url text;
  v_company_id uuid;
  v_deal_id uuid;
  v_owner_id uuid;
BEGIN
  -- Nur ausführen, wenn versendet + Tracking-Nr vorhanden + noch nicht gepusht
  IF NEW.status <> 'shipped' THEN RETURN NEW; END IF;
  IF NEW.tracking_no IS NULL OR length(trim(NEW.tracking_no)) = 0 THEN RETURN NEW; END IF;
  IF NEW.tracking_pushed_at IS NOT NULL THEN RETURN NEW; END IF;

  -- URL automatisch berechnen, falls leer
  v_url := COALESCE(NEW.tracking_url, public.build_tracking_url(NEW.carrier, NEW.tracking_no));

  -- Auftrag laden
  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
    v_recipient := COALESCE(v_order.assigned_to, v_order.created_by);
    v_company_id := COALESCE(NEW.company_id, v_order.company_id);
  ELSE
    v_company_id := NEW.company_id;
  END IF;

  -- Notification an Vertrieb
  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (
      v_recipient,
      'delivery_shipped',
      'Versand erfolgt · ' || NEW.delivery_no,
      'Spediteur: ' || COALESCE(NEW.carrier,'—') || E'\nTracking: ' || NEW.tracking_no
        || COALESCE(E'\n' || v_url, ''),
      COALESCE(v_url, '/admin/deliveries')
    );
  END IF;

  -- CRM-Aktivität: passenden Deal finden (neuester aktiver des Unternehmens, sonst irgendeiner)
  IF v_company_id IS NOT NULL THEN
    SELECT id, owner_id INTO v_deal_id, v_owner_id
    FROM public.deals
    WHERE company_id = v_company_id
    ORDER BY (stage = 'won') DESC, updated_at DESC
    LIMIT 1;

    INSERT INTO public.crm_activities (deal_id, company_id, type, subject, body, owner_id, auto_generated, completed_at)
    VALUES (
      v_deal_id, v_company_id, 'note',
      'Versand erfolgt · ' || NEW.delivery_no,
      'Spediteur: ' || COALESCE(NEW.carrier,'—') || E'\nTracking-Nr.: ' || NEW.tracking_no
        || COALESCE(E'\nLink: ' || v_url, '')
        || COALESCE(E'\nAuftrag: ' || v_order.order_no, ''),
      v_owner_id, true, now()
    );
  END IF;

  NEW.tracking_url := v_url;
  NEW.tracking_pushed_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_delivery_tracking ON public.deliveries;
CREATE TRIGGER trg_push_delivery_tracking
BEFORE UPDATE OF status, tracking_no ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.push_delivery_tracking();
