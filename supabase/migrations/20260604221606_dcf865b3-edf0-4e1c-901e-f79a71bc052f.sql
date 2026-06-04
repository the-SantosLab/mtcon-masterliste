
CREATE OR REPLACE FUNCTION public.assign_internal_ticket_default_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'intern' AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := 'bb4492e4-2f06-46f1-80b4-1d41ae322f5b'::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_internal_ticket_default_owner ON public.support_tickets;
CREATE TRIGGER trg_assign_internal_ticket_default_owner
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.assign_internal_ticket_default_owner();
