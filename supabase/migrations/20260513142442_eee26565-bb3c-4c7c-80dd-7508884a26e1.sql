
-- sequences.status
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pausiert';
UPDATE public.sequences SET status = CASE WHEN is_active THEN 'aktiv' ELSE 'pausiert' END WHERE status IS NULL OR status = 'pausiert';
ALTER TABLE public.sequences ADD CONSTRAINT sequences_status_chk CHECK (status IN ('aktiv','pausiert'));

-- sequence_steps schema alignment
ALTER TABLE public.sequence_steps RENAME COLUMN step_order TO order_index;
ALTER TABLE public.sequence_steps RENAME COLUMN channel TO type;
ALTER TABLE public.sequence_steps ALTER COLUMN type DROP DEFAULT;
-- drop existing check constraint on type if any
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.sequence_steps'::regclass AND contype='c'
  LOOP EXECUTE format('ALTER TABLE public.sequence_steps DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE public.sequence_steps ALTER COLUMN type TYPE text;
ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_type_chk CHECK (type IN ('email','wait','task'));
ALTER TABLE public.sequence_steps ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE public.sequence_steps ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.sequence_steps ALTER COLUMN wait_days DROP NOT NULL;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS task_title text;
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS task_assignee uuid;
