import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Msg = { role: 'user' | 'assistant'; content: string; ts: number };

const LS_KEY = 'mtiq-ask-session-v1';

export function MtiqAsk() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try { const raw = sessionStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem(LS_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignore */ } }, [messages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, sending]);

  const initials = (profile?.short_code || profile?.display_name || '?').slice(0, 2).toUpperCase();

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const next: Msg[] = [...messages, { role: 'user', content: text, ts: Date.now() }];
    setMessages(next);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-ask', { body: { message: text, history } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages(m => [...m, { role: 'assistant', content: String(data?.reply ?? ''), ts: Date.now() }]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Fehler');
      setMessages(m => [...m, { role: 'assistant', content: `Fehler: ${e?.message ?? 'unbekannt'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const reset = () => { setMessages([]); try { sessionStorage.removeItem(LS_KEY); } catch { /* ignore */ } };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="text-[11px]" style={{ color: '#666' }}>Chat mit MTIQ. Texte umschreiben, formulieren, zusammenfassen — oder Fragen zu Vorgängen, Projekten, Kennzahlen.</div>
        <button onClick={reset} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded hover:bg-white/5" style={{ color: '#666' }} title="Sitzung leeren">
          <RefreshCw className="h-3 w-3" /> Neu
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !sending && (
          <div className="text-center text-[12px] mt-8 space-y-2" style={{ color: '#666' }}>
            <div>Chat mit MTIQ.</div>
            <div className="text-[11px]">Text einfügen zum Umschreiben, Formulierungen anfordern, Zusammenfassungen erstellen — oder Fragen zu Vorgängen, Projekten und Kennzahlen stellen.</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="shrink-0 flex items-center justify-center text-[10px] font-medium text-white" style={{ width: 24, height: 24, borderRadius: 8, background: m.role === 'assistant' ? 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' : '#1e293b' }}>
              {m.role === 'assistant' ? '✦' : initials}
            </div>
            <div className="max-w-[78%] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ background: m.role === 'assistant' ? '#181818' : '#1e293b', color: '#e0e0e0', borderRadius: m.role === 'assistant' ? '4px 14px 14px 14px' : '14px 4px 14px 14px' }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-end gap-1.5">
            <div className="shrink-0 flex items-center justify-center text-[10px] text-white" style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}>✦</div>
            <div className="px-3 py-2.5 flex gap-1" style={{ background: '#181818', borderRadius: '4px 14px 14px 14px' }}>
              <span className="mtiq-dot" /><span className="mtiq-dot" style={{ animationDelay: '0.15s' }} /><span className="mtiq-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-2.5 py-2.5 flex items-end gap-2" style={{ borderColor: '#222' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Frag MTIQ…"
          rows={1}
          className="flex-1 resize-none px-3 py-2 text-[13px] outline-none"
          style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 12, color: '#e0e0e0', maxHeight: 96, minHeight: 36, fontFamily: '"DM Sans", system-ui, sans-serif' }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="shrink-0 flex items-center justify-center text-white transition-opacity disabled:opacity-40"
          style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
