-- Avatar support: column on users_profile + public 'avatars' bucket with RLS

ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read on avatars
DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
CREATE POLICY "Avatars publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Admin write/manage via dashboard (also enables app uploads when needed)
DROP POLICY IF EXISTS "Admin manages avatars" ON storage.objects;
CREATE POLICY "Admin manages avatars"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'avatars' AND public.is_admin())
WITH CHECK (bucket_id = 'avatars' AND public.is_admin());