CREATE OR REPLACE FUNCTION public.log_case_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_tasks jsonb;
  v_notes jsonb;
  v_activity jsonb;
  v_emails jsonb;
  v_email_attachments jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_tasks
    FROM public.case_tasks t WHERE t.case_id = OLD.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(n)), '[]'::jsonb) INTO v_notes
    FROM public.case_notes n WHERE n.case_id = OLD.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_activity
    FROM public.case_activity a WHERE a.case_id = OLD.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) INTO v_emails
    FROM public.case_emails e WHERE e.case_id = OLD.id;
  SELECT COALESCE(jsonb_agg(to_jsonb(ea)), '[]'::jsonb) INTO v_email_attachments
    FROM public.case_email_attachments ea WHERE ea.case_id = OLD.id;

  v_snapshot := to_jsonb(OLD)
    || jsonb_build_object(
      '_children', jsonb_build_object(
        'case_tasks', v_tasks,
        'case_notes', v_notes,
        'case_activity', v_activity,
        'case_emails', v_emails,
        'case_email_attachments', v_email_attachments
      )
    );

  INSERT INTO public.deleted_cases (
    case_id, case_no, project_name, client_name, customer_no, status,
    assignee_id, department_id, project_id, created_by, case_created_at,
    due_at, deleted_by, snapshot
  ) VALUES (
    OLD.id, OLD.case_no, OLD.project_name, OLD.client_name, OLD.customer_no, OLD.status::text,
    OLD.assignee_id, OLD.department_id, OLD.project_id, OLD.created_by, OLD.created_at,
    OLD.due_at, auth.uid(), v_snapshot
  );
  RETURN OLD;
END;
$function$;