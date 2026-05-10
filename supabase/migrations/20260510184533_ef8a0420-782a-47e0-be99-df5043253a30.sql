
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS case_notes_case_pinned_idx ON public.case_notes (case_id, pinned DESC, created_at DESC);

-- One-time migration: copy existing cases.note into case_notes as a pinned note (only if not already present)
INSERT INTO public.case_notes (case_id, author_id, body, pinned, created_at)
SELECT c.id, COALESCE(c.created_by, c.assignee_id), c.note, true, c.created_at
FROM public.cases c
WHERE c.note IS NOT NULL
  AND length(trim(c.note)) > 0
  AND COALESCE(c.created_by, c.assignee_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.case_notes n
    WHERE n.case_id = c.id AND n.body = c.note
  );

-- Clear migrated notes from cases.note to avoid duplicate display
UPDATE public.cases SET note = NULL WHERE note IS NOT NULL;
