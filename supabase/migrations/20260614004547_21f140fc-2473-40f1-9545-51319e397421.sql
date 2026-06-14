
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS estimated_hours numeric(6,2);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS planned_week date;

CREATE TABLE IF NOT EXISTS public.capacity_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  capacity_hours numeric(5,2) NOT NULL DEFAULT 40,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_entries TO authenticated;
GRANT ALL ON public.capacity_entries TO service_role;
ALTER TABLE public.capacity_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read capacity" ON public.capacity_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write capacity" ON public.capacity_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_capacity_updated ON public.capacity_entries;
CREATE TRIGGER trg_capacity_updated BEFORE UPDATE ON public.capacity_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_capacity_week ON public.capacity_entries(week_start);
CREATE INDEX IF NOT EXISTS idx_cases_planned_week ON public.cases(planned_week);
