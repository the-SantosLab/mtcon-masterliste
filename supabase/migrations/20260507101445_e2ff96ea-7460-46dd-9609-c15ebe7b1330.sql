
CREATE OR REPLACE FUNCTION public.can_read_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR (dept_owner(p_dept_id) IS NULL AND has_dept_read(p_uid, p_dept_id));
$$;

CREATE OR REPLACE FUNCTION public.can_write_dept(p_dept_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    check_is_admin(p_uid)
    OR p_dept_id IS NULL
    OR dept_owner(p_dept_id) = p_uid
    OR (dept_owner(p_dept_id) IS NULL AND has_dept_write(p_uid, p_dept_id));
$$;
