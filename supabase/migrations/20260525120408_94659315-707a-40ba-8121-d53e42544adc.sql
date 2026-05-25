-- Add soft-delete (trash) columns to notes
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_notes_board_deleted ON public.notes(board_id, deleted_at);

-- Auto-purge trashed notes older than 30 days
CREATE OR REPLACE FUNCTION public.purge_old_trashed_notes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notes
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
$$;