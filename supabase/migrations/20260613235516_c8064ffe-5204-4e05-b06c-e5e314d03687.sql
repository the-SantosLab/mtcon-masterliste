
-- 1) Schema-Erweiterung purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS confirmation_received_at date,
  ADD COLUMN IF NOT EXISTS confirmed_delivery_date  date,
  ADD COLUMN IF NOT EXISTS case_id                  uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delay_flagged_at         timestamptz,
  ADD COLUMN IF NOT EXISTS delay_notified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS customer_notified_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_po_case_id ON public.purchase_orders(case_id);
CREATE INDEX IF NOT EXISTS idx_po_delay_check
  ON public.purchase_orders(status, confirmed_delivery_date, expected_at)
  WHERE status IN ('ordered','partial');

-- 2) Effective due date helper
CREATE OR REPLACE FUNCTION public.po_effective_due(_po public.purchase_orders)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(_po.confirmed_delivery_date, _po.expected_at);
$$;

-- 3) Cron-fähige Check-Funktion
CREATE OR REPLACE FUNCTION public.check_po_delays()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po       RECORD;
  v_due      date;
  v_open     numeric;
  v_dept     uuid;
  v_count    int := 0;
  v_notif    int := 0;
BEGIN
  -- Einkauf-Department einmal ermitteln
  SELECT id INTO v_dept FROM public.departments
   WHERE lower(name) LIKE '%einkauf%' LIMIT 1;

  FOR v_po IN
    SELECT po.*, s.name AS supplier_name
    FROM public.purchase_orders po
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
    WHERE po.status IN ('ordered','partial')
      AND po.delay_flagged_at IS NULL
  LOOP
    v_due := COALESCE(v_po.confirmed_delivery_date, v_po.expected_at);
    IF v_due IS NULL OR v_due >= CURRENT_DATE THEN
      CONTINUE;
    END IF;

    -- Sind überhaupt noch Mengen offen?
    SELECT COALESCE(SUM(qty_ordered - qty_received), 0)
      INTO v_open
      FROM public.purchase_order_items
     WHERE po_id = v_po.id;
    IF v_open <= 0 THEN
      CONTINUE;
    END IF;

    -- Flag setzen
    UPDATE public.purchase_orders
       SET delay_flagged_at = now()
     WHERE id = v_po.id;
    v_count := v_count + 1;

    -- Vorgangs-Notiz, wenn verknüpft
    IF v_po.case_id IS NOT NULL THEN
      INSERT INTO public.case_activity (case_id, actor_id, action, detail)
      VALUES (
        v_po.case_id, NULL, 'po_delay',
        format('Bestellung %s (%s) ist überfällig – zugesagt: %s',
               COALESCE(v_po.po_no,'?'), COALESCE(v_po.supplier_name,'Lieferant'),
               to_char(v_due,'DD.MM.YYYY'))
      );

      -- Vorgangs-Assignee + Watcher benachrichtigen
      INSERT INTO public.notifications (user_id, type, title, body, href)
      SELECT DISTINCT u, 'po_delay',
             format('Lieferverzug: %s', COALESCE(v_po.po_no,'PO')),
             format('Bestellung bei %s überfällig (zugesagt %s).',
                    COALESCE(v_po.supplier_name,'Lieferant'),
                    to_char(v_due,'DD.MM.YYYY')),
             '/cases/' || v_po.case_id::text
        FROM (
          SELECT assignee_id AS u FROM public.cases WHERE id = v_po.case_id AND assignee_id IS NOT NULL
          UNION
          SELECT unnest(watchers) FROM public.cases WHERE id = v_po.case_id
        ) x
       WHERE u IS NOT NULL;
      GET DIAGNOSTICS v_notif = ROW_COUNT;
    END IF;

    -- Einkauf benachrichtigen
    IF v_dept IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, href)
      SELECT dm.user_id, 'po_delay',
             format('Lieferverzug: %s', COALESCE(v_po.po_no,'PO')),
             format('%s ist überfällig (zugesagt %s).',
                    COALESCE(v_po.supplier_name,'Lieferant'),
                    to_char(v_due,'DD.MM.YYYY')),
             '/admin/purchasing'
        FROM public.department_members dm
       WHERE dm.department_id = v_dept;
    END IF;

    UPDATE public.purchase_orders
       SET delay_notified_at = now()
     WHERE id = v_po.id;
  END LOOP;

  RETURN jsonb_build_object('flagged', v_count, 'notifications', v_notif);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_po_delays() TO service_role;
GRANT EXECUTE ON FUNCTION public.po_effective_due(public.purchase_orders) TO authenticated, service_role;

-- 4) pg_cron daily 06:30
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-po-delays-daily') THEN
    PERFORM cron.unschedule('check-po-delays-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'check-po-delays-daily',
  '30 6 * * *',
  $$ SELECT public.check_po_delays(); $$
);
