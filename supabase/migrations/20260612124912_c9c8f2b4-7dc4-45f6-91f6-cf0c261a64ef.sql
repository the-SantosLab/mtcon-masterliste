
CREATE TABLE public.container_module_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  reason text,
  blocked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.container_module_blocks TO authenticated;
GRANT ALL ON public.container_module_blocks TO service_role;

ALTER TABLE public.container_module_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own blocks"
  ON public.container_module_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin(auth.uid()));

CREATE POLICY "Admins manage blocks"
  ON public.container_module_blocks FOR ALL
  TO authenticated
  USING (public.check_is_admin(auth.uid()))
  WITH CHECK (public.check_is_admin(auth.uid()));

CREATE INDEX idx_cmb_user ON public.container_module_blocks(user_id);
