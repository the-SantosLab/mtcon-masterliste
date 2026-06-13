
INSERT INTO public.storage_locations (lager, lagerpl, behaelter, type, is_blocked, note)
SELECT 'SPERR', '0', '0', 'sperrlager'::storage_location_type, true, 'Standard-Sperrlager (gesperrter Bestand)'
WHERE NOT EXISTS (SELECT 1 FROM public.storage_locations WHERE is_blocked = true);

CREATE OR REPLACE FUNCTION public.book_to_sperrlager(
  _stock_location_id uuid,
  _qty numeric DEFAULT NULL,
  _reason text DEFAULT NULL,
  _sperr_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src record;
  v_sperr record;
  v_qty numeric;
  v_user uuid := auth.uid();
  v_notified int := 0;
  v_wh_id uuid;
  v_dept_ids uuid[] := ARRAY[
    'a0000001-0000-0000-0000-000000000002'::uuid,
    'b0000001-0000-0000-0000-000000000001'::uuid,
    'b0000002-0000-0000-0000-000000000001'::uuid
  ];
BEGIN
  IF NOT (has_role(v_user, 'admin'::app_role) OR has_role(v_user, 'staff'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_src FROM public.article_stock_locations WHERE id = _stock_location_id;
  IF v_src IS NULL THEN RAISE EXCEPTION 'source stock location not found'; END IF;

  v_qty := COALESCE(_qty, v_src.bestand);
  IF v_qty <= 0 OR v_qty > v_src.bestand THEN
    RAISE EXCEPTION 'invalid quantity (%) for available stock (%)', v_qty, v_src.bestand;
  END IF;

  IF _sperr_location_id IS NOT NULL THEN
    SELECT * INTO v_sperr FROM public.storage_locations WHERE id = _sperr_location_id AND is_blocked = true;
  ELSE
    SELECT * INTO v_sperr FROM public.storage_locations WHERE is_blocked = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_sperr IS NULL THEN RAISE EXCEPTION 'no Sperrlager configured'; END IF;

  UPDATE public.article_stock_locations
     SET bestand = bestand - v_qty,
         datum_abg = CURRENT_DATE,
         updated_by = v_user,
         note = COALESCE(note,'') || CASE WHEN COALESCE(note,'')='' THEN '' ELSE E'\n' END
                || '[' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] Sperrbuchung -' || v_qty::text
                || COALESCE(' / '||_reason,'')
   WHERE id = _stock_location_id;

  INSERT INTO public.article_stock_locations
    (art_nr, lager, lagerpl, behaelter, charge_nr, charge_ext, bestand, me, source, datum_zu, note, updated_by)
  VALUES
    (v_src.art_nr, v_sperr.lager, v_sperr.lagerpl, v_sperr.behaelter, v_src.charge_nr, v_src.charge_ext,
     v_qty, v_src.me, 'SPERR', CURRENT_DATE, _reason, v_user)
  ON CONFLICT (art_nr, lager, lagerpl, behaelter, charge_nr) DO UPDATE
    SET bestand = public.article_stock_locations.bestand + EXCLUDED.bestand,
        datum_zu = CURRENT_DATE,
        updated_by = v_user,
        note = COALESCE(public.article_stock_locations.note,'') ||
               CASE WHEN COALESCE(public.article_stock_locations.note,'')='' THEN '' ELSE E'\n' END ||
               '[' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] +' || EXCLUDED.bestand::text ||
               COALESCE(' / '||_reason,'');

  SELECT id INTO v_wh_id FROM public.warehouses ORDER BY created_at LIMIT 1;
  IF v_wh_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (art_nr, warehouse_id, movement_type, quantity, reference_type, reference_id, note, created_by, lot_no)
    VALUES (v_src.art_nr, v_wh_id, 'adjustment', -v_qty, 'sperr_booking', _stock_location_id,
            'Sperrbuchung: ' || COALESCE(_reason,'(kein Grund)') || ' / von ' || v_src.lager || '/' || v_src.lagerpl,
            v_user, NULLIF(v_src.charge_nr,''));
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, href)
  SELECT DISTINCT dm.user_id,
         'sperr_booking',
         'Sperrbuchung: ' || v_src.art_nr,
         v_qty::text || ' ' || COALESCE(v_src.me,'Stk') || ' von ' || v_src.lager || '/' || v_src.lagerpl
           || ' nach ' || v_sperr.lager || ' gesperrt.'
           || COALESCE(E'\nGrund: ' || _reason, '')
           || COALESCE(E'\nCharge: ' || NULLIF(v_src.charge_nr,''), ''),
         '/admin/sperrlager'
    FROM public.department_members dm
   WHERE dm.department_id = ANY(v_dept_ids)
     AND dm.user_id <> COALESCE(v_user,'00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS v_notified = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'qty', v_qty,
    'art_nr', v_src.art_nr,
    'sperr_location', v_sperr.lager || '/' || v_sperr.lagerpl,
    'notified_users', v_notified
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_to_sperrlager(uuid, numeric, text, uuid) TO authenticated;
