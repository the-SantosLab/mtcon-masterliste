CREATE TABLE public.erp_pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_pdf_templates_doc_type ON public.erp_pdf_templates (doc_type, created_at DESC);
CREATE UNIQUE INDEX uq_erp_pdf_templates_active ON public.erp_pdf_templates (doc_type) WHERE is_active;

GRANT SELECT ON public.erp_pdf_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.erp_pdf_templates TO authenticated;
GRANT ALL ON public.erp_pdf_templates TO service_role;

ALTER TABLE public.erp_pdf_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal read templates" ON public.erp_pdf_templates
FOR SELECT TO authenticated
USING (public.is_internal_user());

CREATE POLICY "admins manage templates" ON public.erp_pdf_templates
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));