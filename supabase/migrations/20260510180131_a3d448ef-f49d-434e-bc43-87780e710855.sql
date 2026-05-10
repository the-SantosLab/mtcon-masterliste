
CREATE TABLE IF NOT EXISTS public.department_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read department members" ON public.department_members;
CREATE POLICY "Authenticated can read department members"
  ON public.department_members
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manages department members" ON public.department_members;
CREATE POLICY "Admin manages department members"
  ON public.department_members
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_department_members_dept ON public.department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_department_members_user ON public.department_members(user_id);

-- Seed: Digitale Transformation & Prozessinnovation
INSERT INTO public.department_members (department_id, user_id) VALUES
  ('a0000001-0000-0000-0000-000000000005', '6e8d78ce-4f47-4bd4-a3a7-51822a858b40'),
  ('a0000001-0000-0000-0000-000000000005', 'fc88701a-da62-46e3-957b-315beb8d62b0'),
  ('a0000001-0000-0000-0000-000000000005', '6da81b97-5ab7-4601-9130-8ebbb4a70e3e'),
  ('a0000001-0000-0000-0000-000000000005', '3e60592f-f1df-4618-b9bf-db7d35dbdc29')
ON CONFLICT (department_id, user_id) DO NOTHING;
