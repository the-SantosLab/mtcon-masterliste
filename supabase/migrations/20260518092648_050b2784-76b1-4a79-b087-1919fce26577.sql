ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS active_session_token uuid;