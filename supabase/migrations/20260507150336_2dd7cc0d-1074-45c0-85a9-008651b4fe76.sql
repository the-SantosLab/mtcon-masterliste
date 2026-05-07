-- Status enum
DO $$ BEGIN
  CREATE TYPE public.product_request_status AS ENUM ('ausstehend', 'genehmigt', 'abgelehnt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.product_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  article_number text,
  category text NOT NULL,
  description text,
  request_reason text NOT NULL,
  requested_by uuid NOT NULL,
  status public.product_request_status NOT NULL DEFAULT 'ausstehend',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_product_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_requests_status ON public.product_requests(status);
CREATE INDEX IF NOT EXISTS idx_product_requests_requested_by ON public.product_requests(requested_by);

ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own requests, admin and staff see all" ON public.product_requests;
CREATE POLICY "Users see own requests, admin and staff see all"
ON public.product_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
);

DROP POLICY IF EXISTS "Authenticated can insert own requests" ON public.product_requests;
CREATE POLICY "Authenticated can insert own requests"
ON public.product_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "Owner edits while pending; admin can edit anytime" ON public.product_requests;
CREATE POLICY "Owner edits while pending; admin can edit anytime"
ON public.product_requests FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (requested_by = auth.uid() AND status = 'ausstehend')
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (requested_by = auth.uid() AND status = 'ausstehend')
);

DROP POLICY IF EXISTS "Admin can delete requests" ON public.product_requests;
CREATE POLICY "Admin can delete requests"
ON public.product_requests FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_requests_updated_at
BEFORE UPDATE ON public.product_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.product_requests;