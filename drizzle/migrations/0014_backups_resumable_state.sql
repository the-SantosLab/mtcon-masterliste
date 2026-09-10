alter table public.backups add column if not exists state jsonb;
alter table public.backups add column if not exists updated_at timestamptz not null default now();
update public.backups set status = 'failed', error = coalesce(error, 'Abgebrochen (Zeitüberschreitung im Hintergrundlauf)') where status = 'running' and created_at < now() - interval '2 hours';