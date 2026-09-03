import { useEffect, useState } from 'react';
import { Zap, CheckCircle2, Edit3, BarChart3, Calendar, Mail, ArrowLeft, Loader2, Copy, StickyNote, Check, Plus, ListPlus, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildMeetingMinutesPdf, minutesFileName, MINUTES_NOTE_PREFIX, type MeetingMinutes } from '@/lib/meeting-minutes-pdf';
import { sanitizeFileName } from '@/lib/utils';

export interface MtiqAction {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  instruction: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  requiresInput?: boolean;
  /** Custom endpoint statt mtiq-tool. */
  endpoint?: 'mtiq-summarize-case' | 'mtiq-suggest-subtasks';
  /** Spezielle UI-Behandlung */
  kind?: 'text' | 'subtasks';
}

export const MTIQ_ACTIONS: MtiqAction[] = [
  { key: 'summary', icon: Zap, label: 'Zusammenfassen', desc: 'Vorgang in 3–5 Sätzen', instruction: '', endpoint: 'mtiq-summarize-case', kind: 'text' },
  { key: 'subtasks_smart', icon: ListPlus, label: 'Unteraufgaben vorschlagen', desc: 'KI schlägt fehlende Tasks vor', instruction: '', endpoint: 'mtiq-suggest-subtasks', kind: 'subtasks' },
  { key: 'todos', icon: CheckCircle2, label: 'To-dos ableiten', desc: 'Aus Notizen Unteraufgaben vorschlagen', instruction: 'Leite aus den Notizen und dem Stand des Vorgangs eine nummerierte Liste konkreter Unteraufgaben ab. Pro Eintrag: Titel, ggf. Verantwortlich, Fälligkeit. Keine Doppelungen zu vorhandenen Unteraufgaben.' },
  { key: 'text', icon: Edit3, label: 'Text formulieren', desc: 'Beschreibung professionell ausformulieren', instruction: 'Formuliere einen professionellen Beschreibungstext. Wenn eine Eingabe vorhanden ist, überarbeite sie; sonst nutze den vorhandenen Notiztext.', inputLabel: 'Rohtext (optional)', inputPlaceholder: 'Stichpunkte oder Entwurf …' },
  { key: 'risk', icon: BarChart3, label: 'Status analysieren', desc: 'Fortschritt & Risiken bewerten', instruction: 'Bewerte den Fortschritt und die Risiken dieses Vorgangs. Struktur: 1) Stand, 2) Risiken, 3) Empfehlung.' },
  { key: 'meeting', icon: Calendar, label: 'Meeting verarbeiten', desc: 'Transkript → Aufgaben', instruction: 'Extrahiere aus dem Meeting-Transkript relevante Aufgaben für diesen Vorgang. Pro Aufgabe: Titel, Verantwortlich (falls genannt), Fälligkeit (falls genannt).', inputLabel: 'Meeting-Transkript', inputPlaceholder: 'Transkript hier einfügen …', requiresInput: true },
  { key: 'email', icon: Mail, label: 'E-Mail analysieren', desc: 'Eingegangene E-Mail auswerten', instruction: 'Analysiere die E-Mail im Kontext des Vorgangs. Struktur: 1) Kern, 2) Forderungen / Fragen, 3) Vorgeschlagene nächste Schritte, 4) Antwort-Entwurf (kurz, neutral).', inputLabel: 'E-Mail-Text', inputPlaceholder: 'E-Mail hier einfügen …', requiresInput: true },
];

export function MtiqActionsGrid({ vorgangId }: { vorgangId: string }) {
  const [active, setActive] = useState<MtiqAction | null>(null);

  if (active) {
    if (active.kind === 'subtasks') {
      return <SubtaskRunner action={active} vorgangId={vorgangId} onBack={() => setActive(null)} />;
    }
    return <ActionRunner action={active} vorgangId={vorgangId} onBack={() => setActive(null)} />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-3 overflow-y-auto">
      {MTIQ_ACTIONS.map(a => (
        <button
          key={a.key}
          onClick={() => setActive(a)}
          className="text-left p-3 rounded-xl transition-colors"
          style={{ background: '#181818', border: '1px solid #222' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
          onMouseLeave={e => (e.currentTarget.style.background = '#181818')}
        >
          <div
            className="flex items-center justify-center mb-2"
            style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
          >
            <a.icon className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="text-[12px] font-medium" style={{ color: '#e0e0e0' }}>{a.label}</div>
          <div className="text-[10px] mt-0.5 leading-snug" style={{ color: '#666' }}>{a.desc}</div>
        </button>
      ))}
    </div>
  );
}

function ActionRunner({ action, vorgangId, onBack }: { action: MtiqAction; vorgangId: string; onBack: () => void }) {
  const { user } = useAuth();
  const storageKey = `mtiq:action:${vorgangId}:${action.key}`;
  const readSaved = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  };
  const initial = readSaved();
  const [input, setInput] = useState<string>(initial.input ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(initial.result ?? null);
  const [ranAt, setRanAt] = useState<string | null>(initial.ranAt ?? null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ input, result, ranAt })); } catch {}
  }, [storageKey, input, result, ranAt]);

  const clearSaved = () => {
    try { localStorage.removeItem(storageKey); } catch {}
    setInput(''); setResult(null); setRanAt(null); setCopied(false); setSavedNote(false);
  };

  const run = async () => {
    if (action.requiresInput && !input.trim()) {
      toast.error('Bitte Eingabe einfügen.');
      return;
    }
    setBusy(true);
    setResult(null);
    setRanAt(null);
    setCopied(false);
    setSavedNote(false);
    try {
      let reply = '';
      if (action.endpoint === 'mtiq-summarize-case') {
        const { data, error } = await supabase.functions.invoke('mtiq-summarize-case', {
          body: { vorgang_id: vorgangId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        reply = data?.summary ?? '';
      } else {
        const { data, error } = await supabase.functions.invoke('mtiq-tool', {
          body: { vorgang_id: vorgangId, tool: action.key, instruction: action.instruction, input },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        reply = data?.reply ?? '';
      }
      setResult(reply);
      setRanAt(new Date().toISOString());
    } catch (e: any) {
      toast.error(e?.message ?? 'Fehler');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveAsNote = async () => {
    if (!result || !user?.id) return;
    const { error } = await supabase.from('case_notes').insert({
      case_id: vorgangId, body: `[MTIQ – ${action.label}]\n\n${result}`, author_id: user.id,
    });
    if (error) { toast.error(error.message); return; }
    setSavedNote(true);
    toast.success('Als Notiz gespeichert');
  };

  return (
    <div className="flex flex-col h-full">
      <ActionHeader action={action} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {action.inputLabel && (
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: '#666' }}>
              {action.inputLabel}{action.requiresInput ? ' *' : ''}
            </label>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={action.inputPlaceholder}
              rows={6}
              className="w-full resize-y px-3 py-2 text-[12px] outline-none"
              style={{
                background: '#0f0f0f', border: '1px solid #222', borderRadius: 10,
                color: '#e0e0e0', minHeight: 100, maxHeight: 240,
                fontFamily: '"DM Sans", system-ui, sans-serif',
              }}
            />
          </div>
        )}

        {result && (
          <div>
            {ranAt && (
              <div className="text-[10px] mb-1" style={{ color: '#666' }}>
                Ergebnis gespeichert · {new Date(ranAt).toLocaleString('de-DE')}
              </div>
            )}
            <div
              className="p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap"
              style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#e0e0e0' }}
            >
              {result}
            </div>
          </div>
        )}

        {result && (
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md"
              style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Kopieren
            </button>
            <button
              onClick={saveAsNote}
              disabled={savedNote}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md disabled:opacity-50"
              style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}
            >
              {savedNote ? <Check className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
              {savedNote ? 'Gespeichert' : 'Als Notiz speichern'}
            </button>
            <button
              onClick={clearSaved}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md ml-auto"
              style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}
            >
              Verwerfen
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5" style={{ borderTop: '1px solid #222' }}>
        <button
          onClick={run}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-medium text-white rounded-lg disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {busy ? 'Wird ausgeführt …' : result ? 'Erneut ausführen' : 'Ausführen'}
        </button>
      </div>
    </div>
  );
}

function ActionHeader({ action, onBack }: { action: MtiqAction; onBack: () => void }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #222' }}>
      <button onClick={onBack} className="p-1 rounded hover:bg-[#181818]" style={{ color: '#999' }}>
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <div
        className="flex items-center justify-center"
        style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
      >
        <action.icon className="h-3 w-3 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate" style={{ color: '#e0e0e0' }}>{action.label}</div>
        <div className="text-[10px] truncate" style={{ color: '#666' }}>{action.desc}</div>
      </div>
    </div>
  );
}

type Suggestion = { title: string; urgency: number; accepted?: boolean; added?: boolean };

function SubtaskRunner({ action, vorgangId, onBack }: { action: MtiqAction; vorgangId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [adding, setAdding] = useState(false);

  const run = async () => {
    setBusy(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-suggest-subtasks', {
        body: { vorgang_id: vorgangId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tasks: Suggestion[] = (data?.tasks ?? []).map((t: any) => ({
        title: t.title, urgency: t.urgency ?? 0, accepted: true, added: false,
      }));
      if (!tasks.length) toast.info('Keine neuen Vorschläge.');
      setSuggestions(tasks);
    } catch (e: any) {
      toast.error(e?.message ?? 'Fehler');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => {
    setSuggestions(prev => prev.map((s, idx) => idx === i ? { ...s, accepted: !s.accepted } : s));
  };

  const updateTitle = (i: number, value: string) => {
    setSuggestions(prev => prev.map((s, idx) => idx === i ? { ...s, title: value } : s));
  };

  const addAll = async () => {
    if (!user?.id) return;
    const toAdd = suggestions
      .map((s, idx) => ({ s, idx }))
      .filter(x => x.s.accepted && !x.s.added && x.s.title.trim());
    if (!toAdd.length) { toast.error('Keine Auswahl.'); return; }
    setAdding(true);
    try {
      // Sort_order ans Ende anhängen
      const { count } = await supabase
        .from('case_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', vorgangId);
      const base = count ?? 0;

      const rows = toAdd.map((x, k) => ({
        case_id: vorgangId,
        title: x.s.title.trim(),
        urgency: x.s.urgency,
        created_by: user.id,
        sort_order: base + k,
      }));

      const { error } = await (supabase as any).from('case_tasks').insert(rows);
      if (error) throw error;

      const addedIdx = new Set(toAdd.map(x => x.idx));
      setSuggestions(prev => prev.map((s, idx) => addedIdx.has(idx) ? { ...s, added: true } : s));
      toast.success(`${rows.length} Unteraufgabe${rows.length === 1 ? '' : 'n'} angelegt`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Fehler beim Anlegen');
    } finally {
      setAdding(false);
    }
  };

  const pendingCount = suggestions.filter(s => s.accepted && !s.added).length;

  return (
    <div className="flex flex-col h-full">
      <ActionHeader action={action} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {!suggestions.length && !busy && (
          <div className="text-[11px] text-center py-8" style={{ color: '#666' }}>
            Klicke unten auf „Vorschläge generieren", um KI-Vorschläge für fehlende Unteraufgaben zu erhalten.
          </div>
        )}
        {busy && (
          <div className="flex items-center justify-center py-8 gap-2 text-[11px]" style={{ color: '#888' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> KI analysiert den Vorgang …
          </div>
        )}

        {suggestions.map((s, i) => (
          <div
            key={i}
            className="p-2.5 rounded-lg flex items-start gap-2"
            style={{
              background: s.added ? '#0f1f15' : s.accepted ? '#0f172a' : '#141414',
              border: `1px solid ${s.added ? '#1e3f2a' : s.accepted ? '#1e293b' : '#222'}`,
              opacity: s.added ? 0.7 : 1,
            }}
          >
            <button
              onClick={() => !s.added && toggle(i)}
              disabled={s.added}
              className="mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center"
              style={{
                background: s.accepted ? 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' : '#222',
                border: '1px solid #333',
              }}
            >
              {s.accepted && <Check className="h-3 w-3 text-white" />}
            </button>
            <input
              value={s.title}
              onChange={e => updateTitle(i, e.target.value)}
              disabled={s.added}
              className="flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: s.added ? '#666' : '#e0e0e0' }}
            />
            {s.urgency > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: '#7c2d12', color: '#fed7aa' }}
                title="Dringlichkeit"
              >
                {'🌶'.repeat(s.urgency)}
              </span>
            )}
            {s.added && (
              <span className="text-[10px] shrink-0" style={{ color: '#4ade80' }}>angelegt</span>
            )}
          </div>
        ))}
      </div>

      <div className="px-3 py-2.5 space-y-2" style={{ borderTop: '1px solid #222' }}>
        {suggestions.length > 0 && (
          <button
            onClick={addAll}
            disabled={adding || pendingCount === 0}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-medium text-white rounded-lg disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? 'Wird angelegt …' : `${pendingCount} ausgewählte übernehmen`}
          </button>
        )}
        <button
          onClick={run}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-medium text-white rounded-lg disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {busy ? 'Lädt …' : suggestions.length ? 'Neu generieren' : 'Vorschläge generieren'}
        </button>
      </div>
    </div>
  );
}
