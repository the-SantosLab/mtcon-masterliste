CREATE TABLE public.restore_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  backup_id uuid REFERENCES public.backups(id) ON DELETE SET NULL,
  backup_created_at timestamptz,
  started_by uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','warning','failed')),
  rows_inserted integer NOT NULL DEFAULT 0,
  files_restored integer NOT NULL DEFAULT 0,
  files_failed integer NOT NULL DEFAULT 0,
  bytes_restored bigint NOT NULL DEFAULT 0,
  issues_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  table_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);

GRANT SELECT ON public.restore_runs TO authenticated;
GRANT ALL ON public.restore_runs TO service_role;

ALTER TABLE public.restore_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view restore runs"
ON public.restore_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_restore_runs_created_at ON public.restore_runs (created_at DESC);