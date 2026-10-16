ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS drawing_image_path text, ADD COLUMN IF NOT EXISTS photo_image_path text;

CREATE POLICY "article images read internal" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'article-images' AND public.is_internal_user());
CREATE POLICY "article images write staff" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'article-images' AND public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
CREATE POLICY "article images update staff" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'article-images' AND public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
CREATE POLICY "article images delete staff" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'article-images' AND public.is_internal_user() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));

CREATE OR REPLACE FUNCTION public.set_article_images(_art_nr text, _drawing text, _photo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public._gi_require_staff();
  UPDATE public.articles SET drawing_image_path = _drawing, photo_image_path = _photo WHERE art_nr = _art_nr;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artikel nicht gefunden'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_article_images(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.offer_requires_case() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.case_id IS NULL AND NEW.status::text <> 'entwurf' AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Angebot muss mit einem Vorgang der Masterliste verknüpft sein';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_offer_requires_case ON public.offers;
CREATE TRIGGER trg_offer_requires_case BEFORE INSERT OR UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offer_requires_case();