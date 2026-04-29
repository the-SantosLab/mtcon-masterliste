-- Make all columns nullable that currently NOT NULL but reference users_profile
ALTER TABLE public.cases ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.case_tasks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.case_activity ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.project_activity ALTER COLUMN actor_id DROP NOT NULL;

-- Drop and recreate FKs with ON DELETE SET NULL
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_assignee_id_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_created_by_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_closed_by_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_last_changed_by_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_last_changed_by_fkey FOREIGN KEY (last_changed_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_secondary_check_by_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_secondary_check_by_fkey FOREIGN KEY (secondary_check_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_due_date_corrected_by_fkey;
ALTER TABLE public.cases ADD CONSTRAINT cases_due_date_corrected_by_fkey FOREIGN KEY (due_date_corrected_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.case_activity DROP CONSTRAINT IF EXISTS case_activity_actor_id_fkey;
ALTER TABLE public.case_activity ADD CONSTRAINT case_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.project_activity DROP CONSTRAINT IF EXISTS project_activity_actor_id_fkey;
ALTER TABLE public.project_activity ADD CONSTRAINT project_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.case_tasks DROP CONSTRAINT IF EXISTS case_tasks_created_by_fkey;
ALTER TABLE public.case_tasks ADD CONSTRAINT case_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.case_tasks DROP CONSTRAINT IF EXISTS case_tasks_completed_by_fkey;
ALTER TABLE public.case_tasks ADD CONSTRAINT case_tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_assigned_to_fkey;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.response_templates DROP CONSTRAINT IF EXISTS response_templates_created_by_fkey;
ALTER TABLE public.response_templates ADD CONSTRAINT response_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.workflow_settings DROP CONSTRAINT IF EXISTS workflow_settings_updated_by_fkey;
ALTER TABLE public.workflow_settings ADD CONSTRAINT workflow_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

ALTER TABLE public.portal_customers DROP CONSTRAINT IF EXISTS portal_customers_invited_by_fkey;
ALTER TABLE public.portal_customers ADD CONSTRAINT portal_customers_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;