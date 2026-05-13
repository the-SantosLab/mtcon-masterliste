import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useCrmAccess() {
  const { user, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAllowed(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('has_crm_access' as any);
      if (cancelled) return;
      setAllowed(error ? false : Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return { allowed, loading: authLoading || allowed === null };
}
