
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watchers uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.is_project_watcher(p_project_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND p_uid = ANY(COALESCE(p.watchers, ARRAY[]::uuid[]))
  );
$$;

-- Erweitere Dokumentzugriff um Projekt-Watcher
CREATE OR REPLACE FUNCTION public.can_read_document(p_document_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_owner uuid; v_link RECORD;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF public.check_is_admin(p_uid) THEN RETURN true; END IF;
  SELECT owner_id INTO v_owner FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_owner = p_uid THEN RETURN true; END IF;
  FOR v_link IN SELECT entity_type, entity_id FROM public.document_links WHERE document_id = p_document_id LOOP
    IF v_link.entity_type = 'case' THEN
      IF public.can_read_dept(public.case_department(v_link.entity_id), p_uid)
         OR public.is_case_watcher(v_link.entity_id, p_uid) THEN RETURN true; END IF;
    ELSIF v_link.entity_type = 'project' THEN
      IF public.is_project_member(v_link.entity_id, p_uid)
         OR public.is_project_watcher(v_link.entity_id, p_uid) THEN RETURN true; END IF;
      IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = v_link.entity_id AND (p.owner_id = p_uid OR p.created_by = p_uid)) THEN
        RETURN true;
      END IF;
    ELSIF v_link.entity_type = 'company' THEN
      RETURN true;
    ELSIF v_link.entity_type = 'support_ticket' THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END; $$;

-- Erweitere Projekt-Sichtbarkeit, damit Watcher das Projekt selbst laden können
DROP POLICY IF EXISTS "Users see own or member projects" ON public.projects;
CREATE POLICY "Users see own or member projects"
ON public.projects FOR SELECT
USING (
  (created_by = auth.uid())
  OR (owner_id = auth.uid())
  OR is_project_member(id, auth.uid())
  OR (auth.uid() = ANY(COALESCE(watchers, ARRAY[]::uuid[])))
  OR ((visibility = 'department'::text) AND can_read_dept(department_id))
);
