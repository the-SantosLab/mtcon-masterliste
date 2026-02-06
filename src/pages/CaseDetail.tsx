import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { useAuth } from '@/contexts/AuthContext';
import { useCaseActions } from '@/hooks/useCaseActions';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateTime, canClaim, isTerminalStatus, STATUS_LABELS } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type CaseWithRels = Tables<'cases'> & {
  assignee: { display_name: string; short_code: string } | null;
  creator: { display_name: string; short_code: string } | null;
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isViewer } = useAuth();
  const [c, setCase] = useState<CaseWithRels | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [noteChanged, setNoteChanged] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchCase = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code), creator:users_profile!cases_created_by_fkey(display_name, short_code)')
      .eq('id', id)
      .single();
    if (data) {
      setCase(data as CaseWithRels);
      setNote(data.note || '');
      setNoteChanged(false);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCase(); }, [id]);

  const refresh = () => { fetchCase(); setRefreshKey(k => k + 1); };
  const { claimCase, unclaimCase, completeCase } = useCaseActions(user?.id, refresh);

  const canEdit = !isViewer && (isAdmin || c?.assignee_id === user?.id);

  const saveNote = async () => {
    if (!c || !user) return;
    const { error } = await supabase.from('cases').update({ note, last_changed_by: user.id, last_changed_at: new Date().toISOString() }).eq('id', c.id);
    if (error) { toast.error('Fehler'); return; }
    await supabase.from('case_activity').insert({ case_id: c.id, action: 'EDIT', field: 'note', actor_id: user.id });
    toast.success('Bemerkung gespeichert');
    setNoteChanged(false);
    refresh();
  };

  const sendComment = async () => {
    if (!c || !user || !comment.trim()) return;
    await supabase.from('case_activity').insert({ case_id: c.id, action: 'COMMENT', message: comment.trim(), actor_id: user.id });
    setComment('');
    setRefreshKey(k => k + 1);
  };

  const changeStatus = async (newStatus: string) => {
    if (!c || !user) return;
    const old = c.status;
    const { error } = await supabase.from('cases').update({
      status: newStatus as Enums<'case_status'>,
      last_changed_by: user.id, last_changed_at: new Date().toISOString(),
      ...(newStatus === 'abgeschlossen' ? { completed_at: new Date().toISOString(), closed_by: user.id, closed_at: new Date().toISOString() } : {}),
    }).eq('id', c.id);
    if (error) { toast.error('Fehler'); return; }
    await supabase.from('case_activity').insert({ case_id: c.id, action: 'STATUS_CHANGE', field: 'status', old_value: old, new_value: newStatus, actor_id: user.id });
    toast.success('Status geändert');
    refresh();
  };

  if (loading) return <AppLayout><p className="text-xs text-muted-foreground">Laden</p></AppLayout>;
  if (!c) return <AppLayout><p className="text-xs text-destructive">Vorgang nicht gefunden</p></AppLayout>;

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || '–'}</p>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <Link to="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />Zurück zur Liste
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-semibold text-foreground">{c.project_name}</h1>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-xs text-muted-foreground font-mono">{c.case_no}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!isViewer && canClaim(c.status, c.assignee_id) && (
              <Button size="sm" onClick={() => claimCase(c.id)} className="h-8 text-xs">Abholen</Button>
            )}
            {!isViewer && c.assignee_id === user?.id && !isTerminalStatus(c.status) && (
              <Button variant="outline" size="sm" onClick={() => unclaimCase(c.id)} className="h-8 text-xs">Freigeben</Button>
            )}
            {canEdit && !isTerminalStatus(c.status) && (
              <Button variant="outline" size="sm" onClick={() => completeCase(c.id)} className="h-8 text-xs">Abschließen</Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-md border border-border bg-card p-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Details</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Bearbeiter" value={c.assignee?.short_code} />
                <Field label="Kunde" value={c.customer_no} />
                <Field label="Auftraggeber" value={c.client_name} />
                <Field label="Produkt" value={c.product_code} />
                <Field label="Bereich intern" value={c.internal_area_code} />
                <Field label="Projekt-/Artikelnr." value={c.project_article_no} />
                <Field label="Geschätzte Std." value={c.estimated_hours?.toString()} />
                <Field label="Erstellt von" value={c.creator?.short_code} />
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Termine</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <Field label="Auftragseingang" value={formatDate(c.received_at)} />
                <Field label="Gestartet" value={formatDateTime(c.started_at)} />
                <Field label="Endtermin" value={formatDate(c.due_at)} />
                <Field label="Abgeschlossen" value={formatDateTime(c.completed_at)} />
              </div>
            </div>

            {canEdit && !isTerminalStatus(c.status) && (
              <div className="rounded-md border border-border bg-card p-5">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Status ändern</h3>
                <Select value={c.status} onValueChange={changeStatus}>
                  <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.case_status.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-md border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bemerkung</h3>
                {noteChanged && canEdit && (
                  <Button size="sm" variant="outline" onClick={saveNote} className="h-7 text-xs">
                    <Save className="h-3 w-3 mr-1" />Speichern
                  </Button>
                )}
              </div>
              <Textarea
                value={note}
                onChange={e => { setNote(e.target.value); setNoteChanged(true); }}
                rows={3}
                disabled={!canEdit}
                placeholder="Bemerkung hinzufügen"
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktivitäten</h3>
              </div>
              <ActivityTimeline caseId={c.id} refreshKey={refreshKey} />
            </div>

            {!isViewer && (
              <div className="rounded-md border border-border bg-card p-4 space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kommentar</h3>
                <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Kommentar schreiben" className="text-xs" />
                <Button size="sm" onClick={sendComment} disabled={!comment.trim()} className="w-full h-8 text-xs">
                  <Send className="h-3 w-3 mr-1" />Senden
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
