-- Permission level enum
DO $$ BEGIN
  CREATE TYPE public.dept_permission AS ENUM ('none', 'read', 'write');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.department_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  permission public.dept_permission NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_dept_perm_user ON public.department_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_dept_perm_dept ON public.department_permissions(department_id);

ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages dept permissions" ON public.department_permissions;
CREATE POLICY "Admin manages dept permissions"
ON public.department_permissions
FOR ALL TO authenticated
USING (public.check_is_admin())
WITH CHECK (public.check_is_admin());

DROP POLICY IF EXISTS "Users see own dept permissions" ON public.department_permissions;
CREATE POLICY "Users see own dept permissions"
ON public.department_permissions
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_is_admin());

CREATE TRIGGER trg_dept_perm_updated_at
BEFORE UPDATE ON public.department_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();