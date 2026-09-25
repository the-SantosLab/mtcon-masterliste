CREATE OR REPLACE FUNCTION public.set_own_active_session_token(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users_profile
  SET active_session_token = _token
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_own_active_session_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_active_session_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_active_session_token(uuid) TO service_role;