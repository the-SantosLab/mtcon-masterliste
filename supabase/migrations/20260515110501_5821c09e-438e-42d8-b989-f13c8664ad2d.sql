
-- 1. Enum for member role
DO $$ BEGIN
  CREATE TYPE public.dept_member_role AS ENUM ('read', 'write', 'lead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add role column to department_members
ALTER TABLE public.department_members
  ADD COLUMN IF NOT EXISTS role public.dept_member_role NOT NULL DEFAULT 'write';

-- 3. Unique constraint (user, dept) so upserts work
DO $$ BEGIN
  ALTER TABLE public.department_members
    ADD CONSTRAINT department_members_user_dept_unique UNIQUE (user_id, department_id);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN duplicate_table THEN NULL; END $$;

-- 4. Migrate existing department_permissions into department_members
INSERT INTO public.department_members (department_id, user_id, role)
SELECT dp.department_id, dp.user_id,
  CASE dp.permission::text
    WHEN 'write' THEN 'write'::public.dept_member_role
    WHEN 'read'  THEN 'read'::public.dept_member_role
    ELSE 'read'::public.dept_member_role
  END
FROM public.department_permissions dp
WHERE dp.permission::text IN ('read','write')
ON CONFLICT (user_id, department_id) DO UPDATE
  SET role = CASE
    WHEN public.department_members.role = 'lead' THEN 'lead'::public.dept_member_role
    WHEN EXCLUDED.role = 'write' THEN 'write'::public.dept_member_role
    ELSE public.department_members.role
  END;

-- 5. Mirror primary department from users_profile.department_id with write role
INSERT INTO public.department_members (department_id, user_id, role)
SELECT up.department_id, up.id, 'write'::public.dept_member_role
FROM public.users_profile up
WHERE up.department_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- 6. Mirror managers (departments.manager_user_id) as lead
INSERT INTO public.department_members (department_id, user_id, role)
SELECT d.id, d.manager_user_id, 'lead'::public.dept_member_role
FROM public.departments d
WHERE d.manager_user_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO UPDATE
  SET role = 'lead'::public.dept_member_role;

-- 7. New helper that uses department_members.role
CREATE OR REPLACE FUNCTION public.dept_member_role(p_uid uuid, p_dept_id uuid)
RETURNS public.dept_member_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.department_members
  WHERE user_id = p_uid AND department_id = p_dept_id
  LIMIT 1;
$$;

-- 8. Update has_dept_read / has_dept_write to use department_members
CREATE OR REPLACE FUNCTION public.has_dept_read(p_uid uuid, p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE user_id = p_uid AND department_id = p_dept_id
      AND role IN ('read','write','lead')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dept_write(p_uid uuid, p_dept_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE user_id = p_uid AND department_id = p_dept_id
      AND role IN ('write','lead')
  );
$$;

-- 9. Update can_read_dept / can_write_dept to no longer require dept_owner gating
CREATE OR REPLACE FUNCTION public.can_read_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR has_dept_read(p_uid, p_dept_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR has_dept_write(p_uid, p_dept_id);
$$;

-- 10. Sync trigger: keep departments.manager_user_id aligned with role='lead'
CREATE OR REPLACE FUNCTION public.sync_dept_lead()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.role = 'lead' THEN
    UPDATE public.departments
       SET manager_user_id = NEW.user_id
     WHERE id = NEW.department_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'lead' AND NEW.role <> 'lead' THEN
    UPDATE public.departments
       SET manager_user_id = NULL
     WHERE id = NEW.department_id AND manager_user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'lead' THEN
    UPDATE public.departments
       SET manager_user_id = NULL
     WHERE id = OLD.department_id AND manager_user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dept_lead ON public.department_members;
CREATE TRIGGER trg_sync_dept_lead
AFTER INSERT OR UPDATE OR DELETE ON public.department_members
FOR EACH ROW EXECUTE FUNCTION public.sync_dept_lead();
