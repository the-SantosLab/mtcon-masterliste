DROP POLICY IF EXISTS "Staff read all tickets" ON public.support_tickets;
CREATE POLICY "Admins read all tickets"
ON public.support_tickets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff update tickets" ON public.support_tickets;
CREATE POLICY "Admins update tickets"
ON public.support_tickets FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));