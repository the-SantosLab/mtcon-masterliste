
DO $$ BEGIN
  CREATE TYPE public.sequence_status AS ENUM ('aktiv','pausiert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.sequence_step_type AS ENUM ('email','wait','task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM ('aktiv','pausiert','abgeschlossen','abgemeldet','geantwortet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text,
  status public.sequence_status NOT NULL DEFAULT 'pausiert',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read" ON public.sequences;
DROP POLICY IF EXISTS "staff write" ON public.sequences;
CREATE POLICY "auth read" ON public.sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.sequences FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));
DROP TRIGGER IF EXISTS trg_sequences_updated ON public.sequences;
CREATE TRIGGER trg_sequences_updated BEFORE UPDATE ON public.sequences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  type public.sequence_step_type NOT NULL,
  subject text, body text, wait_days int, task_title text, task_assignee uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read" ON public.sequence_steps;
DROP POLICY IF EXISTS "staff write" ON public.sequence_steps;
CREATE POLICY "auth read" ON public.sequence_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.sequence_steps FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));

CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  current_step_index int NOT NULL DEFAULT 0,
  status public.enrollment_status NOT NULL DEFAULT 'aktiv',
  started_at timestamptz NOT NULL DEFAULT now(),
  next_action_at timestamptz, paused_at timestamptz, enrolled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read" ON public.sequence_enrollments;
DROP POLICY IF EXISTS "staff write" ON public.sequence_enrollments;
CREATE POLICY "auth read" ON public.sequence_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.sequence_enrollments FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));
DROP TRIGGER IF EXISTS trg_enrollments_updated ON public.sequence_enrollments;
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON public.sequence_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sequence_step_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  result text, executed_by uuid
);
ALTER TABLE public.sequence_step_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read" ON public.sequence_step_executions;
DROP POLICY IF EXISTS "staff write" ON public.sequence_step_executions;
CREATE POLICY "auth read" ON public.sequence_step_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write" ON public.sequence_step_executions FOR ALL TO authenticated USING (check_is_admin() OR has_role(auth.uid(),'staff'::app_role)) WITH CHECK (check_is_admin() OR has_role(auth.uid(),'staff'::app_role));
