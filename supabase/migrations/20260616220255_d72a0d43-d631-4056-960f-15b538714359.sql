
UPDATE public.issos_invoices i SET company_id = c.id
FROM public.companies c WHERE c.customer_no = i.r_kd_nr AND i.company_id IS NULL;

UPDATE public.issos_invoice_positions p SET invoice_id = i.id
FROM public.issos_invoices i WHERE i.rech_nr = p.rech_nr AND p.invoice_id IS NULL;

UPDATE public.issos_invoice_extras e SET invoice_id = i.id
FROM public.issos_invoices i WHERE i.rech_nr = e.rech_nr AND e.invoice_id IS NULL;

UPDATE public.support_tickets SET status='resolved', resolved_at=now(), updated_at=now()
WHERE ticket_number='BUG-2026-0077';

DROP FUNCTION IF EXISTS public._tmp_noop();
