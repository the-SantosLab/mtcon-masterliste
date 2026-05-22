
CREATE OR REPLACE FUNCTION public.is_board_member(p_board_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.note_board_members WHERE board_id = p_board_id AND user_id = p_uid);
$$;

CREATE OR REPLACE FUNCTION public.is_board_owner(p_board_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.note_boards WHERE id = p_board_id AND owner_id = p_uid);
$$;

DROP POLICY IF EXISTS "read boards" ON public.note_boards;
CREATE POLICY "read boards" ON public.note_boards FOR SELECT USING (
  owner_id = auth.uid()
  OR check_is_admin()
  OR (scope = 'shared' AND public.is_board_member(id, auth.uid()))
);

DROP POLICY IF EXISTS "read board members" ON public.note_board_members;
CREATE POLICY "read board members" ON public.note_board_members FOR SELECT USING (
  user_id = auth.uid()
  OR check_is_admin()
  OR public.is_board_owner(board_id, auth.uid())
);
