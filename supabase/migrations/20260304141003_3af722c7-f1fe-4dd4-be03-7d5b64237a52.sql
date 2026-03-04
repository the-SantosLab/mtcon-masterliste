
-- Portal customers table (invited by staff)
CREATE TABLE public.portal_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  company_name text,
  invited_by uuid REFERENCES public.users_profile(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.portal_customers ENABLE ROW LEVEL SECURITY;

-- Portal customers can read their own record
CREATE POLICY "Portal customers read own" ON public.portal_customers
  FOR SELECT USING (auth_user_id = auth.uid());

-- Staff/admin can read all portal customers
CREATE POLICY "Staff read all portal customers" ON public.portal_customers
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Admin can manage portal customers
CREATE POLICY "Admin manages portal customers" ON public.portal_customers
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Support tickets table
CREATE TYPE public.support_ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');
CREATE TYPE public.support_ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'medium',
  customer_id uuid NOT NULL REFERENCES public.portal_customers(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.users_profile(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Customers see own tickets
CREATE POLICY "Customers see own tickets" ON public.support_tickets
  FOR SELECT USING (
    customer_id IN (SELECT id FROM public.portal_customers WHERE auth_user_id = auth.uid())
  );

-- Customers can create tickets
CREATE POLICY "Customers create tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM public.portal_customers WHERE auth_user_id = auth.uid())
  );

-- Staff/admin can read all tickets
CREATE POLICY "Staff read all tickets" ON public.support_tickets
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Staff/admin can update tickets
CREATE POLICY "Staff update tickets" ON public.support_tickets
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Admin can delete tickets
CREATE POLICY "Admin delete tickets" ON public.support_tickets
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Auto-generate ticket number
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year text;
  v_counter integer;
BEGIN
  v_year := to_char(now(), 'YYYY');
  v_counter := public.next_counter('support_ticket_' || v_year);
  NEW.ticket_number := 'TKT-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_ticket_number_trigger
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();

-- Ticket messages table
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'staff')),
  sender_id uuid NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Customers see public messages on their tickets
CREATE POLICY "Customers see public messages" ON public.ticket_messages
  FOR SELECT USING (
    is_internal = false AND
    ticket_id IN (
      SELECT st.id FROM public.support_tickets st
      JOIN public.portal_customers pc ON pc.id = st.customer_id
      WHERE pc.auth_user_id = auth.uid()
    )
  );

-- Customers can insert messages on their tickets
CREATE POLICY "Customers insert messages" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_type = 'customer' AND
    is_internal = false AND
    ticket_id IN (
      SELECT st.id FROM public.support_tickets st
      JOIN public.portal_customers pc ON pc.id = st.customer_id
      WHERE pc.auth_user_id = auth.uid()
    )
  );

-- Staff see all messages
CREATE POLICY "Staff see all messages" ON public.ticket_messages
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Staff can insert messages
CREATE POLICY "Staff insert messages" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Staff can update own messages
CREATE POLICY "Staff update own messages" ON public.ticket_messages
  FOR UPDATE USING (
    sender_id = auth.uid() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  );

-- Enable realtime for ticket_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;

-- Storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', false);

-- Storage policies
CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'support-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read support attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'support-attachments' AND auth.role() = 'authenticated');

-- Function to check if user is a portal customer
CREATE OR REPLACE FUNCTION public.is_portal_customer(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_customers
    WHERE auth_user_id = uid AND is_active = true
  );
$$;
