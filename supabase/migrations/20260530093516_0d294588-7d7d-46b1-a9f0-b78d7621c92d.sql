-- Ensure pg_net is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_callmebot_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone   text := '+4915239601825';
  v_apikey  text := '4396290';
  v_kind    text;
  v_title   text;
  v_msg     text;
  v_url     text;
BEGIN
  IF NEW.source = 'intern' THEN
    v_kind := CASE NEW.kind
      WHEN 'bug'   THEN 'Bug-Meldung'
      WHEN 'idee'  THEN 'Idee'
      WHEN 'frage' THEN 'Frage'
      ELSE 'Interne Meldung'
    END;
  ELSE
    v_kind := 'Support-Ticket';
  END IF;

  v_title := COALESCE(NEW.title, '(ohne Titel)');
  v_msg := '[MTCON] Neue ' || v_kind || ' ' || COALESCE(NEW.ticket_number, '') ||
           E'\n' || left(v_title, 200) ||
           CASE WHEN NEW.priority IS NOT NULL THEN E'\nPrioritaet: ' || NEW.priority::text ELSE '' END;

  v_url := 'https://api.callmebot.com/whatsapp.php'
        || '?phone=' || replace(v_phone, '+', '%2B')
        || '&apikey=' || v_apikey
        || '&text=' || replace(replace(extensions.url_encode(v_msg), '%20', '+'), '+', '+');

  -- Use net.http_get with manual encoding fallback
  PERFORM net.http_get(
    url := 'https://api.callmebot.com/whatsapp.php?phone=' || replace(v_phone, '+', '%2B')
           || '&apikey=' || v_apikey
           || '&text=' || replace(replace(replace(replace(replace(v_msg,
                  '%','%25'), ' ','+'), E'\n','%0A'), '&','%26'), '#','%23')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block ticket creation
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_callmebot_new_ticket ON public.support_tickets;
CREATE TRIGGER trg_callmebot_new_ticket
AFTER INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_callmebot_new_ticket();