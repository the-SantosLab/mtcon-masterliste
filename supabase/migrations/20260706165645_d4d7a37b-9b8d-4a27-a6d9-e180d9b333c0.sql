SELECT cron.unschedule('sync-personio-attendance-5min');
SELECT cron.schedule(
  'sync-personio-attendance-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tfzwssplxetptxnhrxse.supabase.co/functions/v1/sync-personio-attendance',
    headers := '{"Content-Type":"application/json","x-cron-secret":"MtCon2026!","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmendzc3BseGV0cHR4bmhyeHNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTQ2NjksImV4cCI6MjA4NTk3MDY2OX0.Yd7sM10RhAAG8tdiLXxn75-k4qIKJQV5LfGyHxngN-Y"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);