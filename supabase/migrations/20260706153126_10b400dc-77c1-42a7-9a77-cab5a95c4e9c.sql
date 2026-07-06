CREATE OR REPLACE FUNCTION public.can_read_doc_category(p_category_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR check_is_manager(p_uid)
    OR (p_category_id IS NULL)
    OR EXISTS (
      WITH RECURSIVE anc AS (
        SELECT id, parent_id FROM public.insurance_categories WHERE id = p_category_id
        UNION ALL
        SELECT c.id, c.parent_id FROM public.insurance_categories c
        JOIN anc ON c.id = anc.parent_id
      )
      SELECT 1
      FROM public.document_category_permissions p
      WHERE p.category_id IN (SELECT id FROM anc)
        AND p.permission IN ('read','write')
        AND (
          (p.principal_type = 'user' AND p.user_id = p_uid)
          OR (p.principal_type = 'department' AND has_dept_read(p_uid, p.department_id))
        )
      UNION ALL
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
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR EXISTS (
      WITH RECURSIVE anc AS (
        SELECT id, parent_id FROM public.insurance_categories WHERE id = p_category_id
        UNION ALL
        SELECT c.id, c.parent_id FROM public.insurance_categories c
        JOIN anc ON c.id = anc.parent_id
      )
      SELECT 1
      FROM public.document_category_permissions p
      WHERE p.category_id IN (SELECT id FROM anc)
        AND p.permission = 'write'
        AND (
          (p.principal_type = 'user' AND p.user_id = p_uid)
          OR (p.principal_type = 'department' AND has_dept_write(p_uid, p.department_id))
        )
      UNION ALL
      SELECT 1 FROM public.document_category_permissions p
      WHERE p.category_id = p_category_id
        AND p.permission = 'write'
        AND (
          (p.principal_type = 'user' AND p.user_id = p_uid)
          OR (p.principal_type = 'department' AND has_dept_write(p_uid, p.department_id))
        )
    );
$$;