
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  current_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own presence"
ON public.user_presence FOR SELECT TO authenticated
USING (user_id = auth.uid() OR check_is_admin(auth.uid()));

CREATE POLICY "Users upsert own presence insert"
ON public.user_presence FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users upsert own presence update"
ON public.user_presence FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
ALTER TABLE public.user_presence REPLICA IDENTITY FULL;
