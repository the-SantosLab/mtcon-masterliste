
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE TYPE public.document_entity_type AS ENUM ('case', 'project', 'company', 'support_ticket');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text,
  storage_path text NOT NULL,
  category text,
  current_version int NOT NULL DEFAULT 1,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  owner_id uuid NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_checksum ON public.documents(checksum_sha256);
CREATE INDEX idx_documents_owner ON public.documents(owner_id);
CREATE INDEX idx_documents_archived ON public.documents(archived_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text,
  change_note text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
CREATE INDEX idx_doc_versions_doc ON public.document_versions(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;

CREATE TABLE public.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  entity_type public.document_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  role text,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, entity_type, entity_id)
);
CREATE INDEX idx_doc_links_doc ON public.document_links(document_id);
CREATE INDEX idx_doc_links_entity ON public.document_links(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated;
GRANT ALL ON public.document_links TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_document(p_document_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      IF public.is_project_member(v_link.entity_id, p_uid) THEN RETURN true; END IF;
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

CREATE OR REPLACE FUNCTION public.can_write_document(p_document_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF public.check_is_admin(p_uid) THEN RETURN true; END IF;
  SELECT owner_id INTO v_owner FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_owner = p_uid THEN RETURN true; END IF;
  RETURN public.can_read_document(p_document_id, p_uid);
END; $$;

CREATE OR REPLACE FUNCTION public.can_link_entity(p_entity_type public.document_entity_type, p_entity_id uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF public.check_is_admin(p_uid) THEN RETURN true; END IF;
  IF p_entity_type = 'case' THEN
    RETURN public.can_read_dept(public.case_department(p_entity_id), p_uid)
        OR public.is_case_watcher(p_entity_id, p_uid);
  ELSIF p_entity_type = 'project' THEN
    RETURN public.is_project_member(p_entity_id, p_uid)
        OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_entity_id AND (p.owner_id = p_uid OR p.created_by = p_uid));
  ELSIF p_entity_type IN ('company','support_ticket') THEN
    RETURN true;
  END IF;
  RETURN false;
END; $$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents read" ON public.documents FOR SELECT TO authenticated
  USING (public.can_read_document(id, auth.uid()));
CREATE POLICY "documents insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "documents update" ON public.documents FOR UPDATE TO authenticated
  USING (public.can_write_document(id, auth.uid()))
  WITH CHECK (public.can_write_document(id, auth.uid()));
CREATE POLICY "documents delete" ON public.documents FOR DELETE TO authenticated
  USING (public.check_is_admin(auth.uid()) OR owner_id = auth.uid());

CREATE POLICY "doc_versions read" ON public.document_versions FOR SELECT TO authenticated
  USING (public.can_read_document(document_id, auth.uid()));
CREATE POLICY "doc_versions insert" ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_document(document_id, auth.uid()) AND uploaded_by = auth.uid());
CREATE POLICY "doc_versions delete" ON public.document_versions FOR DELETE TO authenticated
  USING (public.check_is_admin(auth.uid()));

CREATE POLICY "doc_links read" ON public.document_links FOR SELECT TO authenticated
  USING (public.can_read_document(document_id, auth.uid()));
CREATE POLICY "doc_links insert" ON public.document_links FOR INSERT TO authenticated
  WITH CHECK (
    linked_by = auth.uid()
    AND public.can_read_document(document_id, auth.uid())
    AND public.can_link_entity(entity_type, entity_id, auth.uid())
  );
CREATE POLICY "doc_links delete" ON public.document_links FOR DELETE TO authenticated
  USING (public.can_write_document(document_id, auth.uid()));

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "documents bucket read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_read_document(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "documents bucket insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      EXISTS (SELECT 1 FROM public.documents d
              WHERE d.id = ((storage.foldername(name))[1])::uuid AND d.owner_id = auth.uid())
      OR public.can_write_document(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );
CREATE POLICY "documents bucket update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_write_document(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "documents bucket delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.check_is_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.documents d
                 WHERE d.id = ((storage.foldername(name))[1])::uuid AND d.owner_id = auth.uid())
    )
  );
