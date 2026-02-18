
-- ============================================================
-- KS Command Light v1.5 — Schema Migration
-- ============================================================

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  manager_user_id uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Extend users_profile with department + manager + flags
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

-- 3. USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users_profile(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light')),
  compact_tables boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. COUNTERS (atomic auto-numbering)
CREATE TABLE IF NOT EXISTS public.counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value integer NOT NULL DEFAULT 0
);

-- Insert initial counters for current year
INSERT INTO public.counters (key, value)
VALUES
  ('project_2026', 0),
  ('case_2026', 0),
  ('task_2026', 0)
ON CONFLICT (key) DO NOTHING;

-- 5. PROJECTS TABLE (new — central for folders + members + numbering)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text UNIQUE,
  project_code text,
  name text NOT NULL,
  description text,
  owner_id uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'project_members' CHECK (visibility IN ('private','department','project_members')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_by uuid NOT NULL REFERENCES public.users_profile(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 6. PROJECT MEMBERS
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- 7. PROJECT FOLDERS (virtual folder structure)
CREATE TABLE IF NOT EXISTS public.project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  path text NOT NULL,
  parent_id uuid REFERENCES public.project_folders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 8. Extend cases table with project_id, visibility, department_id
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'project_members' CHECK (visibility IN ('private','department','project_members'));

-- 9. Rename case_no sequence tracking — add case_number as human-readable field (keep case_no for legacy)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_number text;

-- ============================================================
-- ATOMIC COUNTER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_counter(p_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value integer;
BEGIN
  INSERT INTO public.counters (key, value)
  VALUES (p_key, 1)
  ON CONFLICT (key) DO UPDATE
    SET value = counters.value + 1
  RETURNING value INTO v_value;
  RETURN v_value;
END;
$$;

-- ============================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================

-- Check if user is global admin (keeps backward compat with user_roles)
CREATE OR REPLACE FUNCTION public.check_is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users_profile WHERE id = uid AND is_admin = true
  );
$$;

-- Get user's department_id
CREATE OR REPLACE FUNCTION public.user_department(uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.users_profile WHERE id = uid;
$$;

-- Check if uid is a manager (either via user_roles or is_manager flag)
CREATE OR REPLACE FUNCTION public.check_is_manager(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile WHERE id = uid AND is_manager = true
  );
$$;

-- Check if target_uid is a direct report of manager_uid
CREATE OR REPLACE FUNCTION public.is_direct_report(manager_uid uuid, target_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = target_uid AND manager_id = manager_uid
  );
$$;

-- Check if user is a member of a project
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = uid
  );
$$;

-- ============================================================
-- AUTO-NUMBERING TRIGGERS
-- ============================================================

-- Project auto-number trigger
CREATE OR REPLACE FUNCTION public.assign_project_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_counter integer;
  v_key text;
BEGIN
  v_year := to_char(now(), 'YYYY');
  v_key := 'project_' || v_year;
  v_counter := public.next_counter(v_key);
  NEW.project_number := 'PRJ-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  -- Generate project code from name if not set
  IF NEW.project_code IS NULL THEN
    NEW.project_code := regexp_replace(upper(substring(NEW.name, 1, 6)), '[^A-Z0-9]', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_project_number ON public.projects;
CREATE TRIGGER trg_assign_project_number
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  WHEN (NEW.project_number IS NULL)
  EXECUTE FUNCTION public.assign_project_number();

-- Case auto-number trigger
CREATE OR REPLACE FUNCTION public.assign_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_counter integer;
  v_key text;
BEGIN
  v_year := to_char(now(), 'YYYY');
  v_key := 'case_' || v_year;
  v_counter := public.next_counter(v_key);
  NEW.case_number := 'VOR-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_case_number ON public.cases;
CREATE TRIGGER trg_assign_case_number
  BEFORE INSERT ON public.cases
  FOR EACH ROW
  WHEN (NEW.case_number IS NULL)
  EXECUTE FUNCTION public.assign_case_number();

-- Updated_at trigger for projects
DROP TRIGGER IF EXISTS trg_update_projects_updated_at ON public.projects;
CREATE TRIGGER trg_update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for user_preferences
CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_update_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_preferences_updated_at();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- DEPARTMENTS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read departments"
  ON public.departments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin manages departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

-- USER_PREFERENCES
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences"
  ON public.user_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- PROJECTS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin sees all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.check_is_admin());

CREATE POLICY "Users see own or member projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR owner_id = auth.uid()
    OR public.is_project_member(id, auth.uid())
    OR (visibility = 'department' AND department_id = public.user_department(auth.uid()))
  );

CREATE POLICY "Staff and admin can create projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.check_is_admin()
    OR public.has_role(auth.uid(), 'staff')
  );

CREATE POLICY "Owner or admin can update projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    public.check_is_admin()
    OR owner_id = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "Admin can delete projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (public.check_is_admin());

-- PROJECT_MEMBERS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read project members"
  ON public.project_members FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin or project owner manages members"
  ON public.project_members FOR ALL
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

-- PROJECT_FOLDERS
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Can see folders of accessible projects"
  ON public.project_folders FOR SELECT
  TO authenticated
  USING (
    public.check_is_admin()
    OR public.is_project_member(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (p.created_by = auth.uid() OR p.owner_id = auth.uid()
             OR (p.visibility = 'department' AND p.department_id = public.user_department(auth.uid())))
    )
  );

CREATE POLICY "Admin manages folders"
  ON public.project_folders FOR ALL
  TO authenticated
  USING (public.check_is_admin())
  WITH CHECK (public.check_is_admin());

-- COUNTERS (read-only for all, write via functions)
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to counters"
  ON public.counters FOR ALL
  USING (false);

-- Storage bucket for project files
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload project files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-files');

CREATE POLICY "Authenticated can read project files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'project-files');

CREATE POLICY "Owner can delete project files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-files' AND owner::uuid = auth.uid());
