
-- Backup table
CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  trigger text NOT NULL CHECK (trigger IN ('schedule','manual','pre_restore')),
  storage_path text NOT NULL,
  size_bytes bigint,
  tables_count integer,
  rows_count integer,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','running')),
  note text,
  error text
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads backups" ON public.backups FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admin inserts backups" ON public.backups FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin updates backups" ON public.backups FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "Admin deletes backups" ON public.backups FOR DELETE TO authenticated USING (is_admin());

CREATE INDEX idx_backups_created_at ON public.backups(created_at DESC);

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only admins can read/manage via authenticated client
CREATE POLICY "Admin reads backup files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'backups' AND is_admin());

CREATE POLICY "Admin writes backup files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'backups' AND is_admin());

CREATE POLICY "Admin deletes backup files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'backups' AND is_admin());

-- Enable extensions for cron HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
