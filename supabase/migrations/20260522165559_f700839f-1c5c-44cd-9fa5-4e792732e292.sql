ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.case_tasks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_tasks;