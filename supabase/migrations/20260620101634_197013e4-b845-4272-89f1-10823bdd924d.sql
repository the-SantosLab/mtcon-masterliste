CREATE OR REPLACE FUNCTION public.gen_next_customer_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_no, '\D', '', 'g'), '')::int), 12000) + 1
    INTO next_num
    FROM public.companies
   WHERE customer_no IS NOT NULL;
  RETURN next_num::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gen_next_customer_no() TO authenticated, service_role;