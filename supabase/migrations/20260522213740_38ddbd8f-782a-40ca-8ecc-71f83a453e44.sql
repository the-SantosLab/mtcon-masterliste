-- Fix faulty board read policy (m.board_id = m.id was wrong)
DROP POLICY IF EXISTS "read boards" ON public.note_boards;
CREATE POLICY "read boards" ON public.note_boards
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR check_is_admin()
  OR (scope = 'shared' AND EXISTS (
    SELECT 1 FROM public.note_board_members m
    WHERE m.board_id = note_boards.id AND m.user_id = auth.uid()
  ))
);

-- Helper to check board write access (owner, admin, or member with edit role)
CREATE OR REPLACE FUNCTION public.can_write_board(_board_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_boards b
    WHERE b.id = _board_id
      AND (
        b.owner_id = auth.uid()
        OR check_is_admin()
        OR (b.scope = 'shared' AND EXISTS (
          SELECT 1 FROM public.note_board_members m
          WHERE m.board_id = b.id AND m.user_id = auth.uid() AND m.role = 'edit'
        ))
      )
  );
$$;
