CREATE OR REPLACE FUNCTION public.restore_deleted_case(p_deleted_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.deleted_cases%ROWTYPE;
  v_snap jsonb;
  v_children jsonb;
  v_case_id uuid;
  v_exists boolean;
BEGIN
  IF NOT public.check_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.deleted_cases WHERE id = p_deleted_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
  IF v_row.snapshot IS NULL THEN
    RAISE EXCEPTION 'no snapshot';
  END IF;

  v_snap := v_row.snapshot;
  v_children := COALESCE(v_snap -> '_children', '{}'::jsonb);
  v_case_id := v_row.case_id;

  -- Disable triggers for this transaction so re-inserts don't create duplicate activity / new case numbers
  SET LOCAL session_replication_role = 'replica';

  SELECT EXISTS(SELECT 1 FROM public.cases WHERE id = v_case_id) INTO v_exists;

  IF v_exists THEN
    UPDATE public.cases
       SET deleted = false, deleted_at = NULL, deleted_by = NULL
     WHERE id = v_case_id;
  ELSE
    INSERT INTO public.cases SELECT * FROM jsonb_populate_record(NULL::public.cases, v_snap - '_children');
    UPDATE public.cases SET deleted = false, deleted_at = NULL, deleted_by = NULL WHERE id = v_case_id;
  END IF;

  -- Children
  IF jsonb_array_length(COALESCE(v_children -> 'case_tasks', '[]'::jsonb)) > 0 THEN
    INSERT INTO public.case_tasks
    SELECT * FROM jsonb_populate_recordset(NULL::public.case_tasks, v_children -> 'case_tasks')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF jsonb_array_length(COALESCE(v_children -> 'case_notes', '[]'::jsonb)) > 0 THEN
    INSERT INTO public.case_notes
    SELECT * FROM jsonb_populate_recordset(NULL::public.case_notes, v_children -> 'case_notes')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF jsonb_array_length(COALESCE(v_children -> 'case_emails', '[]'::jsonb)) > 0 THEN
    INSERT INTO public.case_emails
    SELECT * FROM jsonb_populate_recordset(NULL::public.case_emails, v_children -> 'case_emails')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF jsonb_array_length(COALESCE(v_children -> 'case_email_attachments', '[]'::jsonb)) > 0 THEN
    INSERT INTO public.case_email_attachments
    SELECT * FROM jsonb_populate_recordset(NULL::public.case_email_attachments, v_children -> 'case_email_attachments')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF jsonb_array_length(COALESCE(v_children -> 'case_activity', '[]'::jsonb)) > 0 THEN
    INSERT INTO public.case_activity
    SELECT * FROM jsonb_populate_recordset(NULL::public.case_activity, v_children -> 'case_activity')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Add a restore marker entry
  INSERT INTO public.case_activity (case_id, action, actor_id, message)
  VALUES (v_case_id, 'restored', auth.uid(), 'Vorgang vollständig wiederhergestellt');

  -- Remove the deleted_cases entry
  DELETE FROM public.deleted_cases WHERE id = p_deleted_id;

  SET LOCAL session_replication_role = 'origin';

  RETURN v_case_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_deleted_case(uuid) TO authenticated;