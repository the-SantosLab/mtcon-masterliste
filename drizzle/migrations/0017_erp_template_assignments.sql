CREATE TABLE public.erp_template_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('company','deal','project')),
  scope_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('angebot','ab','bestellung','lieferschein','rechnung')),
  template_id uuid NOT NULL REFERENCES public.erp_pdf_templates(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, doc_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_template_assignments TO authenticated;
GRANT ALL ON public.erp_template_assignments TO service_role;

ALTER TABLE public.erp_template_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal read template assignments"
ON public.erp_template_assignments FOR SELECT TO authenticated
USING (public.is_internal_user());

CREATE POLICY "internal write template assignments"
ON public.erp_template_assignments FOR ALL TO authenticated
USING (public.is_internal_user())
WITH CHECK (public.is_internal_user());

CREATE INDEX idx_erp_template_assignments_lookup
ON public.erp_template_assignments (scope, scope_id, doc_type);