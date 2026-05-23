import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMtiqMessages, confirmProposal } from './useMtiqMessages';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  vorgangId: string;
  seedPrompt?: string;
  onSeedConsumed?: () => void;
}

export function MtiqChat({ vorgangId, seedPrompt, onSeedConsumed }: Props) {
  const { profile } = useAuth();
  const { messages, sending, send } = useMtiqMessages(vorgangId);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (seedPrompt) {
      setInput(seedPrompt);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const txt = input;
    setInput('');
    try { await send(txt); } catch (e) { console.error(e); }
  };

  const initials = (profile?.short_code || profile?.display_name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !sending && (
          <div className="text-center text-[12px] mt-8" style={{ color: '#666' }}>
            Frag MTIQ etwas zu diesem Vorgang.
          </div>
        )}
        {messages.map(m => {
          const proposals: any[] = m.metadata?.proposed_actions ?? [];
          const hasPending = proposals.some(p => (p.status ?? 'pending') === 'pending');
          return (
          <div key={m.id} className={cn('flex items-end gap-1.5', m.role === 'user' && 'flex-row-reverse')}>
            <div
              className="shrink-0 flex items-center justify-center text-[10px] font-medium text-white"
              style={{
                width: 24, height: 24, borderRadius: 8,
                background: m.role === 'assistant'
                  ? 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)'
                  : '#1e293b',
              }}
            >
              {m.role === 'assistant' ? '✦' : initials}
            </div>
            <div className="max-w-[78%] flex flex-col gap-1.5">
              <div
                className="px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{
                  background: m.role === 'assistant' ? '#181818' : '#1e293b',
                  color: '#e0e0e0',
                  borderRadius: m.role === 'assistant' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                }}
              >
                {m.content}
              </div>
              {proposals.length > 0 && (
                <ProposalCard messageId={m.id} proposals={proposals} hasPending={hasPending} />
              )}
            </div>
          </div>
        );})}
        {sending && (
          <div className="flex items-end gap-1.5">
            <div
              className="shrink-0 flex items-center justify-center text-[10px] text-white"
              style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
            >✦</div>
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
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Nachricht an MTIQ…"
          rows={1}
          className="flex-1 resize-none px-3 py-2 text-[13px] outline-none"
          style={{
            background: '#0f0f0f',
            border: '1px solid #222',
            borderRadius: 12,
            color: '#e0e0e0',
            maxHeight: 96,
            minHeight: 36,
            fontFamily: '"DM Sans", system-ui, sans-serif',
          }}
        />
        <button
          onClick={handleSend}
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
