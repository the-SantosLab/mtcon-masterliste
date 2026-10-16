CREATE OR REPLACE FUNCTION public.decide_goods_inspection(_id uuid, _ok boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.goods_inspections;
BEGIN
  PERFORM public._gi_require_staff();
  SELECT * INTO r FROM public.goods_inspections WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Prüfung nicht gefunden'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Prüfung ist bereits entschieden'; END IF;
  IF NOT _ok AND coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Bitte den Mangel beschreiben'; END IF;
  UPDATE public.goods_inspections SET status = CASE WHEN _ok THEN 'released' ELSE 'defect' END,
    note = nullif(trim(_note),''), decided_by = auth.uid(), decided_at = now() WHERE id = _id;
  IF r.case_id IS NOT NULL THEN
    UPDATE public.cases SET status = 'abgeschlossen', closed_at = now(), closed_by = auth.uid(),
      closure_summary = CASE WHEN _ok THEN 'Freigegeben' ELSE 'Fehlerhaft: ' || _note END
     WHERE id = r.case_id AND status::text <> 'abgeschlossen';
  END IF;
  PERFORM public._gi_notify_lager(
    CASE WHEN _ok THEN 'Einlagern: ' ELSE 'Fehlerhafte Lieferung: ' END || r.art_nr,
    r.qty || ' am i-Punkt ' || CASE WHEN _ok THEN 'freigegeben, bitte einlagern.' ELSE 'gesperrt bis Rücksendung. ' || _note END);
END $$;