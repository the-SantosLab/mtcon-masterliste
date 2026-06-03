import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the department IDs the current user leads (either via
 * department_members.role='lead' or as departments.manager_user_id).
 */
export function useLedDepartments() {
  const { user } = useAuth();
  const [ledIds, setLedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLedIds([]);
      setLoading(false);
      return;
    }
    (async () => {
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
      if (cancelled) return;
      const ids = new Set<string>();
      ((memRes as any).data || []).forEach((r: any) => ids.add(r.department_id));
      ((mgrRes as any).data || []).forEach((r: any) => ids.add(r.id));
      setLedIds(Array.from(ids));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { ledIds, isLead: ledIds.length > 0, loading };
}
