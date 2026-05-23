import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useMtiqUnread() {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);
  const [perCase, setPerCase] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user?.id) { setTotal(0); setPerCase({}); return; }
    const { data, error } = await supabase
      .from('ai_messages')
      .select('vorgang_id')
      .eq('user_id', user.id)
      .eq('role', 'assistant')
      .is('read_at', null);
    if (error) { console.warn('mtiq unread', error); return; }
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { map[r.vorgang_id] = (map[r.vorgang_id] ?? 0) + 1; });
    setPerCase(map);
    setTotal((data ?? []).length);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`mtiq-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_messages', filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  return { total, perCase, refresh };
}
