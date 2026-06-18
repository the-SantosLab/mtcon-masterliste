import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Check, X, ExternalLink, ChevronDown, ChevronRight, Inbox, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

type Draft = {
  id: string;
  created_at: string;
  draft_title: string | null;
  draft_description: string | null;
  draft_priority: 'Niedrig' | 'Mittel' | 'Hoch' | 'Kritisch' | null;
  draft_department: string | null;
  source_email_from: string | null;
  source_email_subject: string | null;
  possible_duplicate_of: string | null;
  status: string;
  doc_classification: string | null;
  routing_suggestion: string | null;
  source_kind: string | null;
};

const PRIORITIES = ['Niedrig', 'Mittel', 'Hoch', 'Kritisch'] as const;

function priorityColor(p: string | null): string {
  switch (p) {
    case 'Kritisch': return '#ef4444';
    case 'Hoch': return '#f97316';
    case 'Mittel': return '#eab308';
    case 'Niedrig': return '#64748b';
    default: return '#64748b';
  }
}

export function MtiqDraftsTab({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('mtiq_drafts')
      .select('id, created_at, draft_title, draft_description, draft_priority, draft_department, source_email_from, source_email_subject, possible_duplicate_of, status, doc_classification, routing_suggestion, source_kind')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(30);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setDrafts((data ?? []) as Draft[]);
  };

  useEffect(() => { load(); }, []);

  // Realtime: refresh when new drafts come in / change
  useEffect(() => {
    const ch = supabase.channel('mtiq-drafts-tab')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mtiq_drafts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="text-[11px]" style={{ color: '#888' }}>
          {loading ? 'Lade Entwürfe …' : `${drafts.length} offene${drafts.length === 1 ? 'r' : ''} Entwurf${drafts.length === 1 ? '' : 'e'}`}
        </div>
        <button
          onClick={() => { onClose(); navigate('/mtiq/drafts'); }}
          className="text-[10px] flex items-center gap-1 hover:opacity-80"
          style={{ color: '#0ea5e9' }}
        >
          <Inbox className="h-3 w-3" /> Posteingang öffnen
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loading && drafts.length === 0 && (
          <div className="text-center text-[12px] p-8" style={{ color: '#666' }}>
            Keine offenen Entwürfe.
          </div>
        )}
        {drafts.map(d => (
          <DraftRow
            key={d.id}
            draft={d}
            open={openId === d.id}
            onToggle={() => setOpenId(openId === d.id ? null : d.id)}
            onChanged={load}
            onOpenFull={() => { onClose(); navigate(`/mtiq/drafts?id=${d.id}`); }}
            onOpenVorgang={(vid) => { onClose(); navigate(`/cases/${vid}`); }}
          />
        ))}
      </div>
    </div>
  );
}

function DraftRow({
  draft, open, onToggle, onChanged, onOpenFull, onOpenVorgang,
}: {
  draft: Draft;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onOpenFull: () => void;
  onOpenVorgang: (vorgangId: string) => void;
}) {
  const [title, setTitle] = useState(draft.draft_title ?? '');
  const [desc, setDesc] = useState(draft.draft_description ?? '');
  const [prio, setPrio] = useState<string>(draft.draft_priority ?? 'Mittel');
  const [dept, setDept] = useState(draft.draft_department ?? '');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(draft.draft_title ?? '');
    setDesc(draft.draft_description ?? '');
    setPrio(draft.draft_priority ?? 'Mittel');
    setDept(draft.draft_department ?? '');
    setDirty(false);
  }, [draft.id, draft.draft_title, draft.draft_description, draft.draft_priority, draft.draft_department]);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from('mtiq_drafts').update({
      draft_title: title.trim() || null,
      draft_description: desc.trim() || null,
      draft_priority: prio,
      draft_department: dept.trim() || null,
    }).eq('id', draft.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
    setDirty(false);
    onChanged();
  };

  const approve = async () => {
    if (dirty) await save();
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-approve-draft', {
        body: { draft_id: draft.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const vid = (data as any)?.case_id ?? (data as any)?.vorgang_id;
      toast.success('Vorgang angelegt');
      onChanged();
      if (vid) onOpenVorgang(vid);
    } catch (e: any) {
      toast.error(e?.message ?? 'Freigabe fehlgeschlagen');
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    setRejecting(true);
    const { error } = await (supabase as any).from('mtiq_drafts').update({ status: 'rejected' }).eq('id', draft.id);
    setRejecting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Entwurf verworfen');
    onChanged();
  };

  return (
    <div style={{ borderBottom: '1px solid #1a1a1a' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#1a1a1a]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#666' }} />
              : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#666' }} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, background: priorityColor(prio) }}
              title={prio}
            />
            <div className="text-[12px] truncate font-medium" style={{ color: '#e0e0e0' }}>
              {title || '(ohne Titel)'}
            </div>
            {draft.possible_duplicate_of && (
              <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: '#f59e0b' }} />
            )}
          </div>
          <div className="text-[10px] truncate mt-0.5" style={{ color: '#666' }}>
            {draft.source_email_from
              ? `${draft.source_email_from} · ${formatDistanceToNow(new Date(draft.created_at), { locale: de, addSuffix: true })}`
              : formatDistanceToNow(new Date(draft.created_at), { locale: de, addSuffix: true })}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2" style={{ background: '#0d0d0d' }}>
          <div>
            <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>Titel</label>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setDirty(true); }}
              className="w-full px-2 py-1.5 text-[12px] outline-none"
              style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, color: '#e0e0e0' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>Priorität</label>
              <select
                value={prio}
                onChange={e => { setPrio(e.target.value); setDirty(true); }}
                className="w-full px-2 py-1.5 text-[12px] outline-none"
                style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, color: '#e0e0e0' }}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>Abteilung</label>
              <input
                value={dept}
                onChange={e => { setDept(e.target.value); setDirty(true); }}
                placeholder="—"
                className="w-full px-2 py-1.5 text-[12px] outline-none"
                style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, color: '#e0e0e0' }}
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>Beschreibung</label>
            <textarea
              value={desc}
              onChange={e => { setDesc(e.target.value); setDirty(true); }}
              rows={4}
              className="w-full px-2 py-1.5 text-[12px] outline-none resize-y"
              style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 8, color: '#e0e0e0', minHeight: 70, maxHeight: 180 }}
            />
          </div>

          {draft.possible_duplicate_of && (
            <div
              className="flex items-start gap-1.5 px-2 py-1.5 text-[10px] rounded"
              style={{ background: '#3a2a0a', border: '1px solid #7c5a1a', color: '#fbbf24' }}
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Möglicher Duplikat eines bestehenden Vorgangs.
                <button
                  onClick={() => onOpenVorgang(draft.possible_duplicate_of!)}
                  className="underline ml-1"
                >Anzeigen</button>
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={approve}
              disabled={approving || rejecting}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-white rounded-md disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {dirty ? 'Speichern & Freigeben' : 'Freigeben'}
            </button>
            {dirty && !approving && (
              <button
                onClick={save}
                disabled={saving}
                className="px-2 py-1.5 text-[11px] rounded-md disabled:opacity-50"
                style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Speichern'}
              </button>
            )}
            <button
              onClick={reject}
              disabled={approving || rejecting}
              className="px-2 py-1.5 text-[11px] rounded-md disabled:opacity-50"
              style={{ background: '#181818', border: '1px solid #2a1a1a', color: '#fca5a5' }}
              title="Verwerfen"
            >
              {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            </button>
            <button
              onClick={onOpenFull}
              className="px-2 py-1.5 text-[11px] rounded-md"
              style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}
              title="Vollständig bearbeiten"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
