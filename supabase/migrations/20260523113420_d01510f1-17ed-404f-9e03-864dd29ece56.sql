
-- Severity enum
DO $$ BEGIN
  CREATE TYPE public.announcement_severity AS ENUM ('info','wichtig','kritisch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity public.announcement_severity NOT NULL DEFAULT 'info',
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_by uuid NOT NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_active ON public.announcements (published_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_announcements_archived ON public.announcements (archived_at DESC) WHERE archived_at IS NOT NULL;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view published announcements"
ON public.announcements FOR SELECT TO authenticated
USING (
  published_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
  AND (archived_at IS NULL OR public.check_is_admin(auth.uid()))
  OR public.check_is_admin(auth.uid())
);

CREATE POLICY "Admins can insert announcements"
ON public.announcements FOR INSERT TO authenticated
WITH CHECK (public.check_is_admin(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Admins can update announcements"
ON public.announcements FOR UPDATE TO authenticated
USING (public.check_is_admin(auth.uid()))
WITH CHECK (public.check_is_admin(auth.uid()));

CREATE POLICY "Admins can delete announcements"
ON public.announcements FOR DELETE TO authenticated
USING (public.check_is_admin(auth.uid()));

CREATE TRIGGER trg_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Receipts table
CREATE TABLE public.announcement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivered_at timestamptz NULL,
  seen_at timestamptz NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX idx_announcement_receipts_user ON public.announcement_receipts (user_id);
CREATE INDEX idx_announcement_receipts_ann ON public.announcement_receipts (announcement_id);

ALTER TABLE public.announcement_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own receipts; admins see all"
ON public.announcement_receipts FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_is_admin(auth.uid()));

CREATE POLICY "Users insert own receipts"
ON public.announcement_receipts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own receipts"
ON public.announcement_receipts FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_announcement_receipts_updated_at
BEFORE UPDATE ON public.announcement_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Archive function
CREATE OR REPLACE FUNCTION public.archive_old_announcements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.announcements
    SET archived_at = now()
    WHERE archived_at IS NULL
      AND (
        (expires_at IS NOT NULL AND expires_at < now())
        OR (pinned = false AND published_at < now() - interval '30 days')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

-- Realtime
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER TABLE public.announcement_receipts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_receipts;
