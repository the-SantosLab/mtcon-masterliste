
CREATE OR REPLACE FUNCTION public.notify_callmebot_new_ticket()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_js_phone    text := '+4915239601825';
  v_js_key      text := '4396290';
  v_mario_phone text := '+4916092420656';
  v_mario_key   text := '2459823';
  v_mario_uid uuid;
  v_kind text; v_title text; v_msg text; v_text text;
BEGIN
  IF NEW.source = 'intern' THEN
    v_kind := CASE NEW.kind WHEN 'bug' THEN 'Bug-Meldung' WHEN 'idee' THEN 'Idee'
                            WHEN 'frage' THEN 'Frage' ELSE 'Interne Meldung' END;
  ELSE
    v_kind := 'Support-Ticket';
  END IF;
  v_title := COALESCE(NEW.title, '(ohne Titel)');
  v_msg := '[MTCON] Neue ' || v_kind || ' ' || COALESCE(NEW.ticket_number, '') ||
           E'\n' || left(v_title, 200) ||
           CASE WHEN NEW.priority IS NOT NULL THEN E'\nPrioritaet: ' || NEW.priority::text ELSE '' END;
  v_text := replace(replace(replace(replace(replace(v_msg,'%','%25'),' ','+'),E'\n','%0A'),'&','%26'),'#','%23');

  BEGIN
    PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
      || replace(v_js_phone,'+','%2B') || '&apikey=' || v_js_key || '&text=' || v_text);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_mario_uid := public.user_id_by_email('mario.tolj@mtcon.eu');
  IF v_mario_uid IS NOT NULL AND NEW.reporter_user_id = v_mario_uid THEN
    BEGIN
      PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
        || replace(v_mario_phone,'+','%2B') || '&apikey=' || v_mario_key || '&text=' || v_text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_callmebot_ticket_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_js_phone    text := '+4915239601825';
  v_js_key      text := '4396290';
  v_mario_phone text := '+4916092420656';
  v_mario_key   text := '2459823';
  v_js_uid uuid; v_mario_uid uuid; v_actor uuid := auth.uid();
  v_changes text := ''; v_msg text; v_text text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || E'\nStatus: ' || COALESCE(OLD.status::text,'-') || ' -> ' || COALESCE(NEW.status::text,'-');
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    v_changes := v_changes || E'\nPrioritaet: ' || COALESCE(OLD.priority::text,'-') || ' -> ' || COALESCE(NEW.priority::text,'-');
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    v_changes := v_changes || E'\nZuweisung geaendert';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    v_changes := v_changes || E'\nTitel geaendert';
  END IF;
  IF v_changes = '' THEN RETURN NEW; END IF;

  v_js_uid    := public.user_id_by_email('js@santoslab.de');
  v_mario_uid := public.user_id_by_email('mario.tolj@mtcon.eu');
  v_msg := '[MTCON] Ticket ' || COALESCE(NEW.ticket_number,'') || ' aktualisiert' ||
           E'\n' || left(COALESCE(NEW.title,''), 160) || v_changes;
  v_text := replace(replace(replace(replace(replace(v_msg,'%','%25'),' ','+'),E'\n','%0A'),'&','%26'),'#','%23');

  IF v_js_uid IS NOT NULL AND v_actor IS DISTINCT FROM v_js_uid THEN
    BEGIN
      PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
        || replace(v_js_phone,'+','%2B') || '&apikey=' || v_js_key || '&text=' || v_text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_mario_uid IS NOT NULL
     AND NEW.reporter_user_id = v_mario_uid
     AND v_actor = v_js_uid
     AND v_actor IS DISTINCT FROM v_mario_uid THEN
    BEGIN
      PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
        || replace(v_mario_phone,'+','%2B') || '&apikey=' || v_mario_key || '&text=' || v_text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_callmebot_ticket_update ON public.support_tickets;
CREATE TRIGGER trg_callmebot_ticket_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_callmebot_ticket_update();

CREATE OR REPLACE FUNCTION public.notify_callmebot_ticket_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_js_phone    text := '+4915239601825';
  v_js_key      text := '4396290';
  v_mario_phone text := '+4916092420656';
  v_mario_key   text := '2459823';
  v_js_uid uuid; v_mario_uid uuid;
  v_ticket public.support_tickets%ROWTYPE;
  v_msg text; v_text text;
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_js_uid    := public.user_id_by_email('js@santoslab.de');
  v_mario_uid := public.user_id_by_email('mario.tolj@mtcon.eu');
  v_msg := '[MTCON] Antwort auf ' || COALESCE(v_ticket.ticket_number,'') ||
           E'\n' || left(COALESCE(v_ticket.title,''), 100) ||
           E'\n' || left(COALESCE(NEW.body,''), 200);
  v_text := replace(replace(replace(replace(replace(v_msg,'%','%25'),' ','+'),E'\n','%0A'),'&','%26'),'#','%23');

  IF v_js_uid IS NOT NULL AND NEW.sender_id IS DISTINCT FROM v_js_uid THEN
    BEGIN
      PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
        || replace(v_js_phone,'+','%2B') || '&apikey=' || v_js_key || '&text=' || v_text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_mario_uid IS NOT NULL
     AND v_ticket.reporter_user_id = v_mario_uid
     AND NEW.sender_id = v_js_uid
     AND NEW.sender_id IS DISTINCT FROM v_mario_uid THEN
    BEGIN
      PERFORM net.http_get(url := 'https://api.callmebot.com/whatsapp.php?phone='
        || replace(v_mario_phone,'+','%2B') || '&apikey=' || v_mario_key || '&text=' || v_text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_callmebot_ticket_message ON public.ticket_messages;
CREATE TRIGGER trg_callmebot_ticket_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_callmebot_ticket_message();
