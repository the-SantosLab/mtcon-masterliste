
-- Notify admins when a new internal ticket is created
CREATE OR REPLACE FUNCTION public.notify_admins_new_internal_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_kind_label text;
  v_reporter_name text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'intern' THEN RETURN NEW; END IF;

  v_kind_label := CASE NEW.kind
    WHEN 'bug' THEN 'Bug'
    WHEN 'idee' THEN 'Idee'
    WHEN 'frage' THEN 'Frage'
    ELSE 'Meldung'
  END;

  SELECT COALESCE(display_name, short_code, 'Mitarbeiter') INTO v_reporter_name
    FROM public.users_profile WHERE id = NEW.reporter_user_id;

  FOR v_recipient IN
    SELECT user_id FROM public.user_roles
    WHERE role = 'admin'
      AND user_id <> COALESCE(NEW.reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (
      v_recipient,
      'internal_ticket_new',
      'Neue ' || v_kind_label || '-Meldung · ' || NEW.ticket_number,
      COALESCE(v_reporter_name, 'Mitarbeiter') || ': ' || left(NEW.title, 140),
      '/support/' || NEW.id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_internal_ticket ON public.support_tickets;
CREATE TRIGGER trg_notify_admins_new_internal_ticket
AFTER INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_internal_ticket();

-- Notify reporter on status change of internal tickets
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
    COALESCE(OLD.status, '—') || ' → ' || COALESCE(NEW.status, '—'),
    '/feedback'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reporter_internal_ticket_status ON public.support_tickets;
CREATE TRIGGER trg_notify_reporter_internal_ticket_status
AFTER UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_reporter_internal_ticket_status();
