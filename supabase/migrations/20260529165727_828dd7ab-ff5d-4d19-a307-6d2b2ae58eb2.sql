-- 1) Spalten ergänzen
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'extern',
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS reporter_user_id uuid,
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS client_meta jsonb,
  ADD COLUMN IF NOT EXISTS ai_triage jsonb;

-- customer_id für interne Tickets optional machen
ALTER TABLE public.support_tickets ALTER COLUMN customer_id DROP NOT NULL;

-- Constraints
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_source_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_source_check
  CHECK (source IN ('intern','extern'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_kind_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_kind_check
  CHECK (kind IS NULL OR kind IN ('bug','idee','frage','sonstige'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_source_party_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_source_party_check
  CHECK (
    (source = 'extern' AND customer_id IS NOT NULL)
    OR (source = 'intern' AND reporter_user_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_support_tickets_source ON public.support_tickets(source);
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter ON public.support_tickets(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_case ON public.support_tickets(case_id);

-- 2) Ticket-Nummer-Trigger erweitern (BUG-YYYY für intern)
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year text;
  v_counter integer;
  v_key text;
  v_prefix text;
BEGIN
  v_year := to_char(now(), 'YYYY');
  IF NEW.source = 'intern' THEN
    v_key := 'bug_' || v_year;
    v_prefix := 'BUG-';
  ELSE
    v_key := 'support_ticket_' || v_year;
    v_prefix := 'TKT-';
  END IF;
  v_counter := public.next_counter(v_key);
  NEW.ticket_number := v_prefix || v_year || '-' || lpad(v_counter::text, 4, '0');
  RETURN NEW;
END;
$function$;

-- 3) RLS-Policies für interne Tickets ergänzen
DROP POLICY IF EXISTS "Reporters create internal tickets" ON public.support_tickets;
CREATE POLICY "Reporters create internal tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (source = 'intern' AND reporter_user_id = auth.uid());

DROP POLICY IF EXISTS "Reporters see own internal tickets" ON public.support_tickets;
CREATE POLICY "Reporters see own internal tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (source = 'intern' AND reporter_user_id = auth.uid());

-- 4) Ticket-Messages: Reporter darf bei eigenen internen Tickets lesen/schreiben
DROP POLICY IF EXISTS "Reporters see own internal ticket messages" ON public.ticket_messages;
CREATE POLICY "Reporters see own internal ticket messages"
  ON public.ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND ticket_id IN (
      SELECT id FROM public.support_tickets
      WHERE source = 'intern' AND reporter_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reporters insert internal ticket messages" ON public.ticket_messages;
CREATE POLICY "Reporters insert internal ticket messages"
  ON public.ticket_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'reporter'
    AND is_internal = false
    AND sender_id = auth.uid()
    AND ticket_id IN (
      SELECT id FROM public.support_tickets
      WHERE source = 'intern' AND reporter_user_id = auth.uid()
    )
  );

-- 5) Storage-Policies für support-attachments (Reporter eigene Ordner internal/<ticket_id>/)
DROP POLICY IF EXISTS "Reporters read own internal ticket attachments" ON storage.objects;
CREATE POLICY "Reporters read own internal ticket attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = 'internal'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM public.support_tickets
      WHERE source = 'intern' AND reporter_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Reporters upload internal ticket attachments" ON storage.objects;
CREATE POLICY "Reporters upload internal ticket attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = 'internal'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM public.support_tickets
      WHERE source = 'intern' AND reporter_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff read all support attachments" ON storage.objects;
CREATE POLICY "Staff read all support attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  );

DROP POLICY IF EXISTS "Staff manage all support attachments" ON storage.objects;
CREATE POLICY "Staff manage all support attachments"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  )
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
  );