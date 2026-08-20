
CREATE TABLE public.ghv_categories (LIKE public.insurance_categories INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.ghv_categories ADD PRIMARY KEY (id);
CREATE TABLE public.ghv_agreements (LIKE public.insurance_policies INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.ghv_agreements ADD PRIMARY KEY (id);
CREATE TABLE public.ghv_documents (LIKE public.insurance_documents INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.ghv_documents ADD PRIMARY KEY (id);

ALTER TABLE public.ghv_agreements DROP COLUMN IF EXISTS tsv;
ALTER TABLE public.ghv_agreements ADD CONSTRAINT ghv_agreements_category_fk FOREIGN KEY (category_id) REFERENCES public.ghv_categories(id) ON DELETE SET NULL;
ALTER TABLE public.ghv_documents ADD CONSTRAINT ghv_documents_agreement_fk FOREIGN KEY (policy_id) REFERENCES public.ghv_agreements(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghv_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghv_agreements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghv_documents TO authenticated;
GRANT ALL ON public.ghv_categories TO service_role;
GRANT ALL ON public.ghv_agreements TO service_role;
GRANT ALL ON public.ghv_documents TO service_role;

ALTER TABLE public.ghv_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghv_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghv_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY ghv_cat_read ON public.ghv_categories FOR SELECT TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));
CREATE POLICY ghv_cat_write ON public.ghv_categories FOR ALL TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));

CREATE POLICY ghv_read ON public.ghv_agreements FOR SELECT TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));
CREATE POLICY ghv_write ON public.ghv_agreements FOR ALL TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));

CREATE POLICY ghv_doc_read ON public.ghv_documents FOR SELECT TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));
CREATE POLICY ghv_doc_write ON public.ghv_documents FOR ALL TO authenticated
  USING (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()))
  WITH CHECK (check_is_admin(auth.uid()) OR check_is_manager(auth.uid()));

INSERT INTO public.ghv_categories (name, description, color, icon, sort_order)
VALUES ('Geheimhaltungserklärungen', 'NDAs und Vertraulichkeitsvereinbarungen', 'violet', 'file-signature', 0);
