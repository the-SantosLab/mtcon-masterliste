
-- Drop ticket-related functions with CASCADE
DROP FUNCTION IF EXISTS public.ticket_created_event() CASCADE;
DROP FUNCTION IF EXISTS public.ticket_updated_event() CASCADE;
DROP FUNCTION IF EXISTS public.create_ticket_atomic(text, text, uuid, uuid, text, date) CASCADE;
DROP FUNCTION IF EXISTS public.move_ticket(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.change_ticket_status(uuid, text) CASCADE;

-- Drop ticket tables
DROP TABLE IF EXISTS public.ticket_events CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
