UPDATE public.support_tickets
SET status = 'resolved',
    resolved_at = COALESCE(resolved_at, now())
WHERE ticket_number = 'BUG-2026-0005';