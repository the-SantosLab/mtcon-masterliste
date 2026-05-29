CREATE OR REPLACE FUNCTION public.notify_reporter_internal_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NEW.source IS DISTINCT FROM 'intern' THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.reporter_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.reporter_user_id = COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, href)
  VALUES (
    NEW.reporter_user_id,
    'internal_ticket_status',
    'Meldung ' || NEW.ticket_number || ': Status geändert',
    COALESCE(OLD.status::text, '—') || ' → ' || COALESCE(NEW.status::text, '—'),
    '/feedback'
  );
  RETURN NEW;
END;
$$;