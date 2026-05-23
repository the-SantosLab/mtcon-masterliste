import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Attachment {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
}

interface Msg {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  system_kind: string | null;
  author_name?: string | null;
  author_short?: string | null;
  attachments?: Attachment[];
}

const BUCKET = 'case-attachments';

export function MtiqCaseChat({ vorgangId }: { vorgangId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [signed, setSigned] = useState<Record<string, string>>({});

  const fetchMessages = useCallback(async () => {
    const { data: msgs, error } = await (supabase as any)
      .from('case_chat_messages')
      .select('id, author_id, body, created_at, system_kind')
      .eq('case_id', vorgangId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) { console.error('[MTIQ case chat]', error); setLoading(false); return; }
    const rows: Msg[] = (msgs || []).map((m: any) => ({ ...m, attachments: [] }));
    const ids = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await (supabase as any)
        .from('users_profile').select('id, display_name, short_code').in('id', ids);
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p; });
      rows.forEach(r => {
        r.author_name = map[r.author_id]?.display_name || null;
        r.author_short = map[r.author_id]?.short_code || null;
      });
    }
    // attachments
    const msgIds = rows.map(r => r.id);
    if (msgIds.length) {
      const { data: atts } = await (supabase as any)
        .from('case_chat_attachments').select('*').in('message_id', msgIds);
      const byMsg: Record<string, Attachment[]> = {};
      (atts || []).forEach((a: Attachment) => {
        (byMsg[a.message_id] = byMsg[a.message_id] || []).push(a);
      });
      rows.forEach(r => { r.attachments = byMsg[r.id] || []; });
      const imgs = (atts || []).filter((a: Attachment) => (a.mime_type || '').startsWith('image/'));
      if (imgs.length) {
        const { data: sd } = await (supabase as any).storage.from(BUCKET)
          .createSignedUrls(imgs.map((a: Attachment) => a.storage_path), 300);
        const sm: Record<string, string> = {};
        (sd || []).forEach((s: any, i: number) => { if (s.signedUrl) sm[imgs[i].id] = s.signedUrl; });
        setSigned(prev => ({ ...prev, ...sm }));
      }
    }
    setMessages(rows);
    setLoading(false);
  }, [vorgangId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`mtiq-case-chat-${vorgangId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages', filter: `case_id=eq.${vorgangId}` }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_attachments', filter: `case_id=eq.${vorgangId}` }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [vorgangId, fetchMessages]);

  // mark read
  useEffect(() => {
    if (!user?.id || loading) return;
    const t = setTimeout(async () => {
      await (supabase as any)
        .from('case_chat_reads')
        .upsert({ case_id: vorgangId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'case_id,user_id' });
    }, 600);
    return () => clearTimeout(t);
  }, [vorgangId, user?.id, loading, messages.length]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user?.id) return;
    setSending(true);
    try {
      const { error } = await (supabase as any)
        .from('case_chat_messages')
        .insert({ case_id: vorgangId, author_id: user.id, body });
      if (error) throw error;
      setText('');
    } catch (e: any) {
      console.error(e);
    } finally { setSending(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading && (
          <div className="text-center text-[11px] py-4" style={{ color: '#666' }}>Lädt…</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-[11px] py-4" style={{ color: '#666' }}>Noch keine Nachrichten.</div>
        )}
        {messages.map(m => {
          const mine = m.author_id === user?.id;
          if (m.system_kind) {
            return (
              <div key={m.id} className="text-center text-[10px] py-1" style={{ color: '#555' }}>
                {m.body}
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && (
                <div className="text-[10px] mb-0.5 px-1" style={{ color: '#888' }}>
                  {m.author_name || m.author_short || '—'}
                </div>
              )}
              <div
                className="max-w-[80%] px-2.5 py-1.5 text-[12px] whitespace-pre-wrap break-words"
                style={{
                  background: mine ? 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' : '#1a1a1a',
                  color: mine ? '#fff' : '#e0e0e0',
                  borderRadius: 12,
                  borderTopRightRadius: mine ? 4 : 12,
                  borderTopLeftRadius: mine ? 12 : 4,
                }}
              >
                {m.body}
              </div>
              <div className="text-[9px] mt-0.5 px-1 font-mono" style={{ color: '#555' }}>{fmtTime(m.created_at)}</div>
            </div>
          );
        })}
      </div>
      <div className="px-2.5 py-2 flex items-end gap-2" style={{ borderTop: '1px solid #222' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nachricht an Vorgang…"
          rows={1}
          className="flex-1 resize-none outline-none px-2.5 py-1.5 text-[12px]"
          style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 10, color: '#e0e0e0', maxHeight: 100 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="flex items-center justify-center disabled:opacity-50"
          style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)', color: '#fff' }}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
