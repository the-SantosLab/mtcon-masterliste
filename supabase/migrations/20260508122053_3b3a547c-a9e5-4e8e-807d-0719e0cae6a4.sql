CREATE TABLE IF NOT EXISTS public.deleted_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  case_no text,
  project_name text,
  client_name text,
  customer_no text,
  status text,
  assignee_id uuid,
  department_id uuid,
  project_id uuid,
  created_by uuid,
  case_created_at timestamptz,
  due_at date,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb
);

CREATE INDEX IF NOT EXISTS deleted_cases_deleted_at_idx ON public.deleted_cases(deleted_at DESC);

ALTER TABLE public.deleted_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads deleted cases"
  ON public.deleted_cases FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin deletes deleted cases"
  ON public.deleted_cases FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "System inserts deleted cases"
  ON public.deleted_cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_case_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.deleted_cases (
    case_id, case_no, project_name, client_name, customer_no, status,
    assignee_id, department_id, project_id, created_by, case_created_at,
    due_at, deleted_by, snapshot
  ) VALUES (
    OLD.id, OLD.case_no, OLD.project_name, OLD.client_name, OLD.customer_no, OLD.status::text,
    OLD.assignee_id, OLD.department_id, OLD.project_id, OLD.created_by, OLD.created_at,
    OLD.due_at, auth.uid(), to_jsonb(OLD)
  );
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_case_deletion ON public.cases;
CREATE TRIGGER trg_log_case_deletion
  BEFORE DELETE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.log_case_deletion();