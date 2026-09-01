-- Rechnungen täglich automatisch auf "überfällig" setzen (Job fehlte)
SELECT cron.unschedule('mark-invoices-overdue-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-invoices-overdue-daily');

SELECT cron.schedule(
  'mark-invoices-overdue-daily',
  '0 6 * * *',
  $$SELECT public.mark_invoices_overdue();$$
);