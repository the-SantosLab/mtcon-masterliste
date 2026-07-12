GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_documents TO authenticated;
GRANT ALL ON public.insurance_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_categories TO authenticated;
GRANT ALL ON public.insurance_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_intake_corrections TO authenticated;
GRANT ALL ON public.insurance_intake_corrections TO service_role;