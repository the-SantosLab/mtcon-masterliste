import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UnreadRow {
  case_id: string;
  unread_count: number;
  last_message_at: string | null;
}

/**
 * Fetches unread chat counts for a list of case IDs.
 * Re-fetches when the case list changes or any chat message changes (realtime).
 */
export function useChatUnread(caseIds: string[]) {
  const { user } = useAuth();
  const [map, setMap] = useState<Record<string, number>>({});
  const idsKey = caseIds.slice().sort().join(',');
  const lastIds = useRef('');

  const fetchUnread = useCallback(async () => {
    if (!user?.id || caseIds.length === 0) { setMap({}); return; }
    const { data, error } = await (supabase as any).rpc('get_case_chat_unread', { p_case_ids: caseIds });
    if (error) { console.warn('unread rpc', error); return; }
    const m: Record<string, number> = {};
    (data || []).forEach((r: UnreadRow) => { m[r.case_id] = r.unread_count; });
    setMap(m);
  }, [user?.id, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (idsKey === lastIds.current && idsKey !== '') return;
    lastIds.current = idsKey;
    fetchUnread();
  }, [idsKey, fetchUnread]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`chat-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages' }, () => fetchUnread())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_reads', filter: `user_id=eq.${user.id}` }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchUnread]);

  return { unreadMap: map, refresh: fetchUnread };
}
