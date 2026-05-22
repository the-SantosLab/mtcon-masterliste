
-- Boards
CREATE TABLE public.note_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','shared')),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_boards_owner ON public.note_boards(owner_id);
CREATE INDEX idx_note_boards_dept ON public.note_boards(department_id);

-- Members
CREATE TABLE public.note_board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.note_boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'edit' CHECK (role IN ('view','edit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX idx_note_board_members_user ON public.note_board_members(user_id);

-- Notes
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.note_boards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow','pink','blue','green','purple','orange')),
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  position_x numeric NOT NULL DEFAULT 0,
  position_y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 240,
  height numeric NOT NULL DEFAULT 240,
  z_index integer NOT NULL DEFAULT 1,
  pinned boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_board ON public.notes(board_id);

-- Helper functions
CREATE OR REPLACE FUNCTION public.can_read_board(p_board_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_boards b
    WHERE b.id = p_board_id
      AND (
        b.owner_id = p_uid
        OR check_is_admin(p_uid)
        OR (b.scope = 'shared' AND EXISTS (
          SELECT 1 FROM public.note_board_members m
          WHERE m.board_id = b.id AND m.user_id = p_uid
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_board(p_board_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_boards b
    WHERE b.id = p_board_id
      AND (
        b.owner_id = p_uid
        OR check_is_admin(p_uid)
        OR (b.scope = 'shared' AND EXISTS (
          SELECT 1 FROM public.note_board_members m
          WHERE m.board_id = b.id AND m.user_id = p_uid AND m.role = 'edit'
        ))
      )
  );
$$;

-- RLS
ALTER TABLE public.note_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read boards" ON public.note_boards FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR check_is_admin() OR (scope = 'shared' AND EXISTS (
    SELECT 1 FROM public.note_board_members m WHERE m.board_id = id AND m.user_id = auth.uid()
  )));
CREATE POLICY "insert own boards" ON public.note_boards FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "update own boards" ON public.note_boards FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR check_is_admin());
CREATE POLICY "delete own boards" ON public.note_boards FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR check_is_admin());

CREATE POLICY "read board members" ON public.note_board_members FOR SELECT TO authenticated
  USING (can_read_board(board_id));
CREATE POLICY "manage members" ON public.note_board_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.note_boards b WHERE b.id = board_id AND (b.owner_id = auth.uid() OR check_is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.note_boards b WHERE b.id = board_id AND (b.owner_id = auth.uid() OR check_is_admin())));

CREATE POLICY "read notes" ON public.notes FOR SELECT TO authenticated
  USING (can_read_board(board_id));
CREATE POLICY "insert notes" ON public.notes FOR INSERT TO authenticated
  WITH CHECK (can_write_board(board_id) AND author_id = auth.uid());
CREATE POLICY "update notes" ON public.notes FOR UPDATE TO authenticated
  USING (can_write_board(board_id));
CREATE POLICY "delete notes" ON public.notes FOR DELETE TO authenticated
  USING (can_write_board(board_id));

-- Updated_at triggers
CREATE TRIGGER trg_note_boards_updated BEFORE UPDATE ON public.note_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER TABLE public.note_boards REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.note_boards;
