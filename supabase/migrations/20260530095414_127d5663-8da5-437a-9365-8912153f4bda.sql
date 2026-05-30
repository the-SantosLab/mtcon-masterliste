
-- 1) Permissions table
CREATE TABLE public.document_category_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.insurance_categories(id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user','department')),
  user_id uuid,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('read','write')),
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (principal_type = 'user'       AND user_id IS NOT NULL AND department_id IS NULL) OR
    (principal_type = 'department' AND department_id IS NOT NULL AND user_id IS NULL)
  )
);

CREATE UNIQUE INDEX uq_dcp_user
  ON public.document_category_permissions(category_id, user_id)
  WHERE principal_type = 'user';
CREATE UNIQUE INDEX uq_dcp_dept
  ON public.document_category_permissions(category_id, department_id)
  WHERE principal_type = 'department';
CREATE INDEX idx_dcp_category ON public.document_category_permissions(category_id);
CREATE INDEX idx_dcp_user     ON public.document_category_permissions(user_id);
CREATE INDEX idx_dcp_dept     ON public.document_category_permissions(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_category_permissions TO authenticated;
GRANT ALL ON public.document_category_permissions TO service_role;

ALTER TABLE public.document_category_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dcp_admin_all ON public.document_category_permissions
  FOR ALL TO authenticated
  USING (check_is_admin(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()));

CREATE POLICY dcp_read_own ON public.document_category_permissions
  FOR SELECT TO authenticated
  USING (
    check_is_admin(auth.uid())
    OR check_is_manager(auth.uid())
    OR (principal_type = 'user' AND user_id = auth.uid())
    OR (principal_type = 'department' AND has_dept_read(auth.uid(), department_id))
  );

-- 2) Helper functions
CREATE OR REPLACE FUNCTION public.can_read_doc_category(p_category_id uuid, p_uid uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    check_is_admin(p_uid)
    OR check_is_manager(p_uid)
    OR (p_category_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.document_category_permissions p
      WHERE p.category_id = p_category_id
        AND p.permission IN ('read','write')
        AND (
          (p.principal_type = 'user' AND p.user_id = p_uid)
          OR (p.principal_type = 'department' AND has_dept_read(p_uid, p.department_id))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_doc_category(p_category_id uuid, p_uid uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    check_is_admin(p_uid)
    OR EXISTS (
      SELECT 1 FROM public.document_category_permissions p
      WHERE p.category_id = p_category_id
        AND p.permission = 'write'
        AND (
          (p.principal_type = 'user' AND p.user_id = p_uid)
          OR (p.principal_type = 'department' AND has_dept_write(p_uid, p.department_id))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.policy_category(p_policy_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT category_id FROM public.insurance_policies WHERE id = p_policy_id $$;

-- 3) Replace RLS on insurance_categories
DROP POLICY IF EXISTS ins_cat_read_admin_manager ON public.insurance_categories;
DROP POLICY IF EXISTS ins_cat_write_admin        ON public.insurance_categories;

CREATE POLICY ins_cat_read ON public.insurance_categories
  FOR SELECT TO authenticated
  USING (can_read_doc_category(id));

CREATE POLICY ins_cat_insert_admin ON public.insurance_categories
  FOR INSERT TO authenticated WITH CHECK (check_is_admin(auth.uid()));

CREATE POLICY ins_cat_update_admin ON public.insurance_categories
  FOR UPDATE TO authenticated
  USING (check_is_admin(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()));

CREATE POLICY ins_cat_delete_admin ON public.insurance_categories
  FOR DELETE TO authenticated USING (check_is_admin(auth.uid()));

-- 4) Replace RLS on insurance_policies
DROP POLICY IF EXISTS ins_pol_read_admin_manager ON public.insurance_policies;
DROP POLICY IF EXISTS ins_pol_write_admin        ON public.insurance_policies;

CREATE POLICY ins_pol_read ON public.insurance_policies
  FOR SELECT TO authenticated
  USING (can_read_doc_category(category_id));

CREATE POLICY ins_pol_insert ON public.insurance_policies
  FOR INSERT TO authenticated
  WITH CHECK (can_write_doc_category(category_id));

CREATE POLICY ins_pol_update ON public.insurance_policies
  FOR UPDATE TO authenticated
  USING (can_write_doc_category(category_id))
  WITH CHECK (can_write_doc_category(category_id));

CREATE POLICY ins_pol_delete ON public.insurance_policies
  FOR DELETE TO authenticated
  USING (can_write_doc_category(category_id));

-- 5) Replace RLS on insurance_documents (inherits via policy -> category)
DROP POLICY IF EXISTS ins_doc_read_admin_manager ON public.insurance_documents;
DROP POLICY IF EXISTS ins_doc_write_admin        ON public.insurance_documents;

CREATE POLICY ins_doc_read ON public.insurance_documents
  FOR SELECT TO authenticated
  USING (can_read_doc_category(policy_category(policy_id)));

CREATE POLICY ins_doc_insert ON public.insurance_documents
  FOR INSERT TO authenticated
  WITH CHECK (can_write_doc_category(policy_category(policy_id)));

CREATE POLICY ins_doc_update ON public.insurance_documents
  FOR UPDATE TO authenticated
  USING (can_write_doc_category(policy_category(policy_id)))
  WITH CHECK (can_write_doc_category(policy_category(policy_id)));

CREATE POLICY ins_doc_delete ON public.insurance_documents
  FOR DELETE TO authenticated
  USING (can_write_doc_category(policy_category(policy_id)));
