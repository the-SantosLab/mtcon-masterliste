ALTER TABLE public.note_boards
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_note_boards_deleted ON public.note_boards(deleted_at);

CREATE OR REPLACE FUNCTION public.purge_old_trashed_boards()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.note_boards
  WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
$$;