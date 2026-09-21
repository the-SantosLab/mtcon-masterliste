import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cachedFetch, getCached } from '@/lib/shellCache';

export function useCrmAccess() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const cacheKey = `crm-access:${user?.id ?? ''}`;
  const [allowed, setAllowed] = useState<boolean | null>(() => getCached<boolean>(cacheKey) ?? null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAllowed(false); return; }
    let cancelled = false;
    void cachedFetch<boolean>(cacheKey, async () => {
      const { data, error } = await supabase.rpc('has_crm_access' as any);
      // Admins behalten den Zugang auch dann, wenn die Prüfung fehlschlägt.
      return error ? isAdmin : (Boolean(data) || isAdmin);
    }, { ttl: 300_000 })
      .then(v => { if (!cancelled) setAllowed(v); })
      .catch(() => { if (!cancelled) setAllowed(isAdmin); });
    return () => { cancelled = true; };
  }, [user, authLoading, isAdmin, cacheKey]);

  return { allowed, loading: authLoading || allowed === null };
}
