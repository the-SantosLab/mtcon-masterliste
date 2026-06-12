import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useContainerBlocks() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setBlocked(new Set()); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from('container_module_blocks')
        .select('module_key')
        .eq('user_id', user.id);
      if (cancelled) return;
      setBlocked(new Set((data ?? []).map((r: any) => r.module_key)));
      setLoading(false);
    };
    void load();
    const ch = supabase
      .channel(`cmb-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'container_module_blocks', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  return { blocked, loading, isBlocked: (key: string) => blocked.has(key) };
}
