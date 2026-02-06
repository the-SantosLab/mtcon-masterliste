
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer');
CREATE TYPE public.case_status AS ENUM ('nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug', 'abgeschlossen', 'verworfen', 'archiv');

-- Users Profile
CREATE TABLE public.users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles (separate table per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Internal Areas
CREATE TABLE public.internal_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cases (Vorgänge)
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status case_status NOT NULL DEFAULT 'nicht_begonnen',
  case_no TEXT NOT NULL,
  project_name TEXT NOT NULL,
  assignee_id UUID REFERENCES public.users_profile(id),
  internal_area_code TEXT,
  product_code TEXT,
  customer_no TEXT,
  client_name TEXT,
  project_article_no TEXT,
  received_at DATE,
  due_at DATE,
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  estimated_hours NUMERIC,
  note TEXT,
  created_by UUID NOT NULL REFERENCES public.users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID REFERENCES public.users_profile(id),
  closed_at TIMESTAMPTZ,
  last_changed_by UUID REFERENCES public.users_profile(id),
  last_changed_at TIMESTAMPTZ,
  secondary_check_by UUID REFERENCES public.users_profile(id),
  secondary_check_confirmed_at TIMESTAMPTZ,
  due_date_corrected_by UUID REFERENCES public.users_profile(id),
  due_date_corrected_at TIMESTAMPTZ
);

-- Case Activity
CREATE TABLE public.case_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  message TEXT,
  actor_id UUID NOT NULL REFERENCES public.users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_cases_assignee ON public.cases(assignee_id);
CREATE INDEX idx_cases_due_at ON public.cases(due_at);
CREATE INDEX idx_cases_case_no ON public.cases(case_no);
CREATE INDEX idx_case_activity_case_id ON public.case_activity(case_id);
CREATE INDEX idx_case_activity_actor_id ON public.case_activity(actor_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Convenience function: is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_users_profile_updated_at
  BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users_profile (id, display_name, short_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'short_code', split_part(NEW.email, '@', 1))
  );
  -- Default role: staff
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS ============

-- users_profile: all authenticated can read (need names), own update, admin full
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all profiles"
  ON public.users_profile FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users_profile FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Admin can insert profiles"
  ON public.users_profile FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR id = auth.uid());

CREATE POLICY "Admin can delete profiles"
  ON public.users_profile FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- user_roles: admin manages, authenticated can read (to check own role)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manages roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin updates roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin deletes roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- customers: all read, admin write
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manages customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- products: all read, admin write
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manages products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- internal_areas: all read, admin write
ALTER TABLE public.internal_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read areas"
  ON public.internal_areas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manages areas"
  ON public.internal_areas FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- cases: all authenticated read, staff/admin insert, assignee/admin update, admin delete
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff and admin can insert cases"
  ON public.cases FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_role(auth.uid(), 'staff')
  );

CREATE POLICY "Assignee or admin can update cases"
  ON public.cases FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR assignee_id = auth.uid()
    OR assignee_id IS NULL
  );

CREATE POLICY "Admin can delete cases"
  ON public.cases FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- case_activity: all authenticated read, staff/admin insert
ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read activity"
  ON public.case_activity FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff and admin can insert activity"
  ON public.case_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_role(auth.uid(), 'staff')
  );

CREATE POLICY "Admin can manage activity"
  ON public.case_activity FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Enable realtime for cases and case_activity
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
