import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatRelativeTime } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type NoteEntry = Tables<'case_activity'> & {
  actor: { display_name: string; short_code: string } | null;
};

interface CaseNotesProps {
  caseId: string;
  canEdit: boolean;
  userId: string;
  refreshKey?: number;
  onRefresh?: () => void;
}

export function CaseNotes({ caseId, canEdit, userId, refreshKey, onRefresh }: CaseNotesProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('case_activity')
      .select('*, actor:users_profile!case_activity_actor_id_fkey(display_name, short_code)')
      .eq('case_id', caseId)
      .eq('action', 'COMMENT')
      .order('created_at', { ascending: false });
    setNotes((data as NoteEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
    const channel = supabase
      .channel(`notes-${caseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_activity', filter: `case_id=eq.${caseId}` }, () => {
        fetchNotes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, refreshKey]);

  const submit = async () => {
    if (!text.trim() || !userId) return;
    setSending(true);
    const { error } = await supabase.from('case_activity').insert({
      case_id: caseId,
      action: 'COMMENT',
      message: text.trim(),
      actor_id: userId,
    });
    setSending(false);
    if (error) { toast.error('Fehler beim Speichern'); return; }
    setText('');
    fetchNotes();
    onRefresh?.();
  };

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notizen</h3>

      {canEdit && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            placeholder="Notiz hinzufügen"
            className="text-xs"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!text.trim() || sending} className="h-7 text-xs">
              <Send className="h-3 w-3 mr-1" />Hinzufügen
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Laden</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Notizen</p>
      ) : (
        <div className="space-y-0 divide-y divide-border -mx-5">
          {notes.map(n => (
            <div key={n.id} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-foreground">{n.actor?.short_code || '–'}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{formatRelativeTime(n.created_at)}</span>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
