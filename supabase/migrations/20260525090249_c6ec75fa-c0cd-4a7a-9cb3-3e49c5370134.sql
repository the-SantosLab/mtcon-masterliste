DROP POLICY IF EXISTS "Admin can delete mtiq_drafts" ON public.mtiq_drafts;
CREATE POLICY "Own or admin can delete mtiq_drafts"
ON public.mtiq_drafts
FOR DELETE
USING (check_is_admin(auth.uid()) OR created_by = auth.uid());