
CREATE TABLE public.project_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users_profile(id),
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read project activity"
  ON public.project_activity FOR SELECT
  USING (true);

CREATE POLICY "Staff and admin can insert project activity"
  ON public.project_activity FOR INSERT
  WITH CHECK (is_admin() OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Admin can delete project activity"
  ON public.project_activity FOR DELETE
  USING (is_admin());
