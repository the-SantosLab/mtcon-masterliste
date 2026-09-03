CREATE OR REPLACE FUNCTION public.crm_deal_won_promote_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'won' AND OLD.stage IS DISTINCT FROM 'won' AND NEW.company_id IS NOT NULL THEN
    UPDATE public.companies
       SET partner_role = (CASE WHEN partner_role = 'supplier'::public.partner_role THEN 'both' ELSE 'customer' END)::public.partner_role
     WHERE id = NEW.company_id AND partner_role IN ('lead'::public.partner_role,'supplier'::public.partner_role);
    UPDATE public.orders o SET customer_no = c.customer_no
      FROM public.companies c
     WHERE c.id = NEW.company_id AND o.company_id = c.id AND o.customer_no IS NULL AND c.customer_no IS NOT NULL
       AND o.notes LIKE '%deal:'||NEW.id::text||'%';
  END IF;
  RETURN NEW;
END $$;