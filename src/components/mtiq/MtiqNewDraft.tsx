import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
}

const EXAMPLES = [
  'Kunde Müller bittet um Angebot für 500x Steckverbinder SV-12B bis Ende Monat.',
  'Lager: Bestand SV-12B prüfen, ggf. nachbestellen, Lieferzeit klären.',
  'Technik: Datenblatt-Update für Produktreihe XR-200 vorbereiten.',
];

export function MtiqNewDraft({ onClose }: Props) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 5) {
      toast.error('Bitte etwas mehr Kontext eingeben.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-text-intake', {
        body: { text: trimmed, title: title.trim() || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Entwurf erstellt – im Posteingang prüfen.');
      setText('');
      setTitle('');
      const draftId = (data as any)?.draft?.id;
      onClose();
      navigate('/mtiq/drafts' + (draftId ? `?id=${draftId}` : ''));
    } catch (e: any) {
      toast.error(e?.message ?? 'Erzeugung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="text-[11px]" style={{ color: '#888' }}>
          Beschreibe einen neuen Vorgang in eigenen Worten – MTIQ strukturiert ihn als Entwurf im Posteingang.
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide" style={{ color: '#666' }}>Titel (optional)</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="z. B. Angebot Müller 500x SV-12B"
            disabled={loading}
            className="mt-1 w-full px-2.5 py-1.5 text-[12px] outline-none"
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 10, color: '#e0e0e0' }}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide" style={{ color: '#666' }}>Inhalt</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Fließtext oder Stichpunkte…"
            disabled={loading}
            rows={9}
            className="mt-1 w-full px-2.5 py-2 text-[12px] outline-none resize-none"
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 10, color: '#e0e0e0', fontFamily: 'inherit' }}
          />
          <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: '#555' }}>
            <span>{text.trim().length} Zeichen</span>
            <span>⌘/Strg + Enter zum Senden</span>
          </div>
        </div>

        {text.trim().length === 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: '#666' }}>Beispiele</div>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setText(ex)}
                className="block w-full text-left px-2.5 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ background: '#141414', border: '1px solid #1f1f1f', color: '#aaa' }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid #1a1a1a' }}>
        <button
          onClick={() => { onClose(); navigate('/mtiq/drafts'); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg"
          style={{ background: 'transparent', border: '1px solid #222', color: '#aaa' }}
        >
          <Inbox className="h-3.5 w-3.5" /> Posteingang
        </button>
        <div className="flex-1" />
        <button
          onClick={submit}
          onKeyDown={() => {}}
          disabled={loading || text.trim().length < 5}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Entwurf erstellen
        </button>
      </div>

      {/* Capture Cmd/Ctrl+Enter at panel level */}
      <KeyHandler onSubmit={submit} disabled={loading || text.trim().length < 5} />
    </div>
  );
}

function KeyHandler({ onSubmit, disabled }: { onSubmit: () => void; disabled: boolean }) {
  // Listen globally so Enter works from textarea
  if (typeof window !== 'undefined') {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !disabled) {
        e.preventDefault();
        onSubmit();
      }
    };
    // Replace any previous listener for this component instance
    (window as any).__mtiqNewDraftHandler && window.removeEventListener('keydown', (window as any).__mtiqNewDraftHandler);
    (window as any).__mtiqNewDraftHandler = handler;
    window.addEventListener('keydown', handler);
  }
  return null;
}
