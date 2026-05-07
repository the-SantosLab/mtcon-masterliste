-- Dedicated notes table so we can edit/delete with audit history
CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  edited_by uuid
);

CREATE INDEX idx_case_notes_case ON public.case_notes(case_id, created_at DESC);

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read notes if can read case dept"
ON public.case_notes FOR SELECT TO authenticated
USING (can_read_dept(case_department(case_id)));

CREATE POLICY "Staff and admin can insert notes"
ON public.case_notes FOR INSERT TO authenticated
WITH CHECK (
  (check_is_admin() OR has_role(auth.uid(), 'staff'::app_role))
  AND can_write_dept(case_department(case_id))
  AND author_id = auth.uid()
);

CREATE POLICY "Author or admin can update notes"
ON public.case_notes FOR UPDATE TO authenticated
USING (check_is_admin() OR author_id = auth.uid())
WITH CHECK (check_is_admin() OR author_id = auth.uid());

CREATE POLICY "Author or admin can delete notes"
ON public.case_notes FOR DELETE TO authenticated
USING (check_is_admin() OR author_id = auth.uid());

CREATE TRIGGER trg_case_notes_updated_at
  BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity logging: create / edit / delete -> case_activity
CREATE OR REPLACE FUNCTION public.log_case_note_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, new_value, message)
    VALUES (NEW.case_id, 'note_created', COALESCE(v_actor, NEW.author_id), 'note', left(NEW.body, 200), 'Notiz hinzugefügt');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, new_value, message)
      VALUES (NEW.case_id, 'note_updated', COALESCE(v_actor, NEW.edited_by, NEW.author_id), 'note', left(OLD.body, 200), left(NEW.body, 200), 'Notiz bearbeitet');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.case_activity (case_id, action, actor_id, field, old_value, message)
    VALUES (OLD.case_id, 'note_deleted', COALESCE(v_actor, OLD.author_id), 'note', left(OLD.body, 200), 'Notiz gelöscht');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_case_notes_activity
AFTER INSERT OR UPDATE OR DELETE ON public.case_notes
FOR EACH ROW EXECUTE FUNCTION public.log_case_note_change();

-- Migrate existing COMMENT entries into case_notes (keep originals as historical 'note_created' record)
INSERT INTO public.case_notes (id, case_id, author_id, body, created_at, updated_at)
SELECT ca.id, ca.case_id, COALESCE(ca.actor_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(ca.message,''), ca.created_at, ca.created_at
FROM public.case_activity ca
WHERE ca.action = 'COMMENT' AND ca.actor_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;