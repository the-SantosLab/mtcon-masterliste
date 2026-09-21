import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cachedFetch, getCached } from '@/lib/shellCache';

/**
 * Returns the department IDs the current user leads (either via
 * department_members.role='lead' or as departments.manager_user_id).
 */
export function useLedDepartments() {
  const { user } = useAuth();
  const cacheKey = `led-departments:${user?.id ?? ''}`;
  const cached = getCached<string[]>(cacheKey);
  const [ledIds, setLedIds] = useState<string[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLedIds([]);
      setLoading(false);
      return;
    }
    void cachedFetch<string[]>(cacheKey, async () => {
      const [memRes, mgrRes] = await Promise.all([
        (supabase as any)
          .from('department_members')
          .select('department_id')
          .eq('user_id', user.id)
          .eq('role', 'lead'),
        supabase
          .from('departments')
          .select('id')
          .eq('manager_user_id', user.id),
      ]);
      const ids = new Set<string>();
      ((memRes as any).data || []).forEach((r: any) => ids.add(r.department_id));
      ((mgrRes as any).data || []).forEach((r: any) => ids.add(r.id));
      return Array.from(ids);
    }, { ttl: 300_000 })
      .then(ids => { if (!cancelled) { setLedIds(ids); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [user?.id, cacheKey]);

  return { ledIds, isLead: ledIds.length > 0, loading };
}
