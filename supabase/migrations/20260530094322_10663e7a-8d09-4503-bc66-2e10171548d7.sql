CREATE OR REPLACE FUNCTION public.notify_callmebot_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recipients text[][] := ARRAY[
    ARRAY['+4915239601825', '4396290'],
    ARRAY['+4916092420656', '2459823']
  ];
  v_kind  text;
  v_title text;
  v_msg   text;
  v_text  text;
  v_phone text;
  v_key   text;
  i int;
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

  v_text := replace(replace(replace(replace(replace(v_msg,
              '%','%25'), ' ','+'), E'\n','%0A'), '&','%26'), '#','%23');

  FOR i IN 1 .. array_length(v_recipients, 1) LOOP
    v_phone := v_recipients[i][1];
    v_key   := v_recipients[i][2];
    BEGIN
      PERFORM net.http_get(
        url := 'https://api.callmebot.com/whatsapp.php?phone='
               || replace(v_phone, '+', '%2B')
               || '&apikey=' || v_key
               || '&text='   || v_text
      );
    EXCEPTION WHEN OTHERS THEN
      -- ignore single-recipient failures
      NULL;
    END;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;