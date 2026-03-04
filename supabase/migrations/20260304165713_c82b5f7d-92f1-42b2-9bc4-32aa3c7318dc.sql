
-- Update assign_case_number to also set case_no (the NOT NULL field)
CREATE OR REPLACE FUNCTION public.assign_case_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year text;
  v_counter integer;
  v_key text;
  v_number text;
BEGIN
  v_year := to_char(now(), 'YYYY');
  v_key := 'case_' || v_year;
  v_counter := public.next_counter(v_key);
  v_number := 'VOR-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  NEW.case_number := v_number;
  NEW.case_no := v_number;
  RETURN NEW;
END;
$function$;

-- Set a default for case_no so inserts without it don't fail before trigger runs
ALTER TABLE public.cases ALTER COLUMN case_no SET DEFAULT 'PENDING';

-- Create the trigger (if not exists)
DROP TRIGGER IF EXISTS trg_assign_case_number ON public.cases;
CREATE TRIGGER trg_assign_case_number
  BEFORE INSERT ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_case_number();
