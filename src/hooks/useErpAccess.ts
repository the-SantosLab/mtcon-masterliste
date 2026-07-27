import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useErpAccess() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAllowed(false); return; }
    if (isAdmin) { setAllowed(true); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('has_erp_access' as any);
      if (cancelled) return;
      setAllowed(error ? false : Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [user, isAdmin, authLoading]);

  return { allowed: allowed === true, loading: authLoading || allowed === null };
}
