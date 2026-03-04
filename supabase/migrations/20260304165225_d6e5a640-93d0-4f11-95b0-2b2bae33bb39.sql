
-- Table for case tasks (checklist items)
CREATE TABLE public.case_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users_profile(id),
  created_by uuid NOT NULL REFERENCES public.users_profile(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  sort_order integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read tasks
CREATE POLICY "Authenticated can read case tasks"
  ON public.case_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Staff and admin can insert tasks
CREATE POLICY "Staff and admin can insert case tasks"
  ON public.case_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- Staff and admin can update tasks (toggle completion etc)
CREATE POLICY "Staff and admin can update case tasks"
  ON public.case_tasks FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR public.has_role(auth.uid(), 'staff'::app_role)
  );

-- Admin can delete tasks
CREATE POLICY "Admin can delete case tasks"
  ON public.case_tasks FOR DELETE
  TO authenticated
  USING (public.is_admin() OR public.has_role(auth.uid(), 'staff'::app_role));
