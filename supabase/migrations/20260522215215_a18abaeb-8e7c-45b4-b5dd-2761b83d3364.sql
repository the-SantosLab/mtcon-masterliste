
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'postit',
  ADD COLUMN IF NOT EXISTS fill_color text,
  ADD COLUMN IF NOT EXISTS stroke_color text,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_kind_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_kind_check
  CHECK (kind IN ('postit','text','rect','rounded','circle','triangle','arrow','table'));
