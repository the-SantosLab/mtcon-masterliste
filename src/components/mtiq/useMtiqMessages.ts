import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AiMessage {
  id: string;
  vorgang_id: string;
  role: 'user' | 'assistant';
  content: string;
  read_at: string | null;
  created_at: string;
}

export function useMtiqMessages(vorgangId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!vorgangId || !user?.id) { setMessages([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('vorgang_id', vorgangId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setLoading(false);
    if (error) { console.warn('mtiq load', error); return; }
    setMessages((data ?? []) as AiMessage[]);
  }, [vorgangId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Mark unread assistant messages as read when opening
  useEffect(() => {
    if (!vorgangId || !user?.id) return;
    supabase.rpc('mark_ai_messages_read' as any, { p_vorgang_id: vorgangId }).then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgangId, user?.id]);

  useEffect(() => {
    if (!vorgangId || !user?.id) return;
    const ch = supabase.channel(`mtiq-msgs-${vorgangId}-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_messages', filter: `vorgang_id=eq.${vorgangId}` },
        (payload) => {
          const m = payload.new as AiMessage;
          if (m.user_id !== user.id) return;
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [vorgangId, user?.id]);

  const send = useCallback(async (text: string) => {
    if (!vorgangId || !text.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-chat', {
        body: { vorgang_id: vorgangId, message: text.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await load();
    } finally {
      setSending(false);
    }
  }, [vorgangId, load]);

  return { messages, loading, sending, send, reload: load };
}
