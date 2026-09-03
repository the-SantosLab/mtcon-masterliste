GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_documents TO authenticated;
GRANT ALL ON public.inbox_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_corrections TO authenticated;
GRANT ALL ON public.inbox_corrections TO service_role;