ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS sidebar_compact boolean NOT NULL DEFAULT true;

UPDATE public.support_tickets SET status='resolved', resolved_at=now(), updated_at=now() WHERE ticket_number='BUG-2026-0078';