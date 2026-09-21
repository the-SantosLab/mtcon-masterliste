import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cachedFetch, getCached } from '@/lib/shellCache';

interface UnreadState { total: number; perCase: Record<string, number> }

export function useMtiqUnread() {
  const { user } = useAuth();
  const cacheKey = `mtiq-unread:${user?.id ?? ''}`;
  const cached = getCached<UnreadState>(cacheKey);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [perCase, setPerCase] = useState<Record<string, number>>(cached?.perCase ?? {});

  const load = useCallback(async (force = false) => {
    if (!user?.id) { setTotal(0); setPerCase({}); return; }
    try {
      const state = await cachedFetch<UnreadState>(cacheKey, async () => {
        const { data, error } = await supabase
          .from('ai_messages')
          .select('vorgang_id')
          .eq('user_id', user.id)
          .eq('role', 'assistant')
          .is('read_at', null);
        if (error) throw error;
        const map: Record<string, number> = {};
        (data ?? []).forEach((r: any) => { map[r.vorgang_id] = (map[r.vorgang_id] ?? 0) + 1; });
        return { total: (data ?? []).length, perCase: map };
      }, { force });
      setPerCase(state.perCase);
      setTotal(state.total);
    } catch (e) {
      console.warn('mtiq unread', e);
    }
  }, [user?.id, cacheKey]);

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`mtiq-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_messages', filter: `user_id=eq.${user.id}` }, () => void load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  return { total, perCase, refresh };
}
