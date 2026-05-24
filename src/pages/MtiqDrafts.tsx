import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trash2, Plus, ChevronDown, ChevronRight, Inbox, Mail, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

type TaskItem = {
  title: string;
  department: string | null;
  assignee_hint: string | null;
  due_date: string | null;
};

type Draft = {
  id: string;
  created_at: string;
  source_email_from: string | null;
  source_email_subject: string | null;
  source_email_body: string | null;
  draft_title: string | null;
  draft_description: string | null;
  draft_department: string | null;
  draft_priority: 'Niedrig' | 'Mittel' | 'Hoch' | 'Kritisch' | null;
  draft_due_date: string | null;
  draft_tasks: TaskItem[];
  mtiq_reasoning: string | null;
  status: 'pending' | 'approved' | 'rejected';
  vorgang_id: string | null;
};

const PRIORITIES = ['Niedrig', 'Mittel', 'Hoch', 'Kritisch'] as const;

function priorityClasses(p: string | null): string {
  switch (p) {
    case 'Kritisch': return 'bg-red-500/10 text-red-300 border-red-500/30 backdrop-blur-md';
    case 'Hoch': return 'bg-orange-500/10 text-orange-300 border-orange-500/30 backdrop-blur-md';
    case 'Mittel': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30 backdrop-blur-md';
    case 'Niedrig': return 'bg-white/5 text-muted-foreground border-white/10 backdrop-blur-md';
    default: return 'bg-white/5 text-muted-foreground border-white/10 backdrop-blur-md';
  }
}

function statusClasses(s: string): string {
  switch (s) {
    case 'pending': return 'bg-primary/10 text-primary border-primary/30 backdrop-blur-md';
    case 'approved': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 backdrop-blur-md';
    case 'rejected': return 'bg-white/5 text-muted-foreground border-white/10 backdrop-blur-md';
    default: return 'bg-white/5 text-muted-foreground border-white/10 backdrop-blur-md';
  }
}

export default function MtiqDrafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // editable copy of selected draft
  const [edit, setEdit] = useState<Draft | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);


  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('mtiq_drafts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      toast.error('Entwürfe konnten nicht geladen werden');
    } else {
      const normalized: Draft[] = (data || []).map((d: any) => ({
        ...d,
        draft_tasks: Array.isArray(d.draft_tasks) ? d.draft_tasks : [],
      }));
      setDrafts(normalized);
      if (!selectedId && normalized.length) {
        const firstPending = normalized.find(d => d.status === 'pending');
        setSelectedId((firstPending ?? normalized[0]).id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    (supabase as any).from('departments').select('id, name').order('name').then(({ data }: any) => {
      setDepartments(data || []);
    });
    // realtime
    const ch = supabase
      .channel('mtiq-drafts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mtiq_drafts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) { setEdit(null); return; }
    const d = drafts.find(x => x.id === selectedId);
    if (d) setEdit(JSON.parse(JSON.stringify(d)));
  }, [selectedId, drafts]);

  const pendingCount = useMemo(() => drafts.filter(d => d.status === 'pending').length, [drafts]);

  const saveEdits = async (patch: Partial<Draft>) => {
    if (!edit) return;
    const { error } = await (supabase as any).from('mtiq_drafts').update(patch).eq('id', edit.id);
    if (error) toast.error(error.message);
  };

  const handleField = (key: keyof Draft, value: any) => {
    if (!edit) return;
    setEdit({ ...edit, [key]: value });
  };

  // persist on blur
  const persistAll = async () => {
    if (!edit) return;
    await saveEdits({
      draft_title: edit.draft_title,
      draft_description: edit.draft_description,
      draft_department: edit.draft_department,
      draft_priority: edit.draft_priority,
      draft_due_date: edit.draft_due_date,
      draft_tasks: edit.draft_tasks as any,
    });
  };

  const updateTask = (idx: number, patch: Partial<TaskItem>) => {
    if (!edit) return;
    const next = [...edit.draft_tasks];
    next[idx] = { ...next[idx], ...patch };
    setEdit({ ...edit, draft_tasks: next });
  };

  const deleteTask = async (idx: number) => {
    if (!edit) return;
    const next = edit.draft_tasks.filter((_, i) => i !== idx);
    setEdit({ ...edit, draft_tasks: next });
    await saveEdits({ draft_tasks: next as any });
  };

  const addTask = async () => {
    if (!edit) return;
    const next = [...edit.draft_tasks, { title: '', department: null, assignee_hint: null, due_date: null }];
    setEdit({ ...edit, draft_tasks: next });
    await saveEdits({ draft_tasks: next as any });
  };

  const approve = async () => {
    if (!edit) return;
    setApproving(true);
    try {
      await persistAll();
      const { data, error } = await supabase.functions.invoke('mtiq-approve-draft', {
        body: { draft_id: edit.id },
      });
      if (error) throw error;
      const id = (data as any)?.vorgang_id;
      if (id) {
        toast.success('Vorgang angelegt');
        navigate(`/cases/${id}`);
      } else {
        toast.error('Vorgang-ID fehlt in Antwort');
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Freigabe fehlgeschlagen');
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!edit) return;
    setRejecting(true);
    try {
      const { error } = await (supabase as any).from('mtiq_drafts').update({ status: 'rejected' }).eq('id', edit.id);
      if (error) throw error;
      toast.success('Entwurf abgelehnt');
      setConfirmReject(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Ablehnen fehlgeschlagen');
    } finally {
      setRejecting(false);
    }
  };


  return (
    <AppLayout>
      <div className="relative flex flex-col h-full overflow-hidden">
        {/* Ambient background mesh */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl opacity-40" />
          <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl opacity-30" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl opacity-30" />
        </div>

        <div className="px-6 py-5 border-b border-white/5 bg-background/40 backdrop-blur-xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-white/10 backdrop-blur-md flex items-center justify-center">
                <Inbox className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">MTIQ Posteingang</h1>
              <Badge className={statusClasses('pending')}>{pendingCount} offen</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-12">
              E-Mails die MTIQ analysiert hat und auf Freigabe warten
            </p>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_3fr] min-h-0">
          {/* LEFT — list */}
          <div className="border-r border-white/5 overflow-y-auto bg-background/20 backdrop-blur-xl">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Lädt…</div>
            ) : drafts.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="p-3 space-y-2">
                {drafts.map(d => {
                  const active = d.id === selectedId;
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className={`group w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                          active
                            ? 'bg-primary/10 border-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_8px_24px_-8px_hsl(var(--primary)/0.3)]'
                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                        } ${d.status === 'pending' ? 'relative' : ''}`}
                      >
                        {d.status === 'pending' && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-primary/40" />
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {d.draft_title || d.source_email_subject || '(ohne Titel)'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {d.source_email_from || '—'}
                            </div>
                          </div>
                          <Badge variant="outline" className={priorityClasses(d.draft_priority)}>
                            {d.draft_priority ?? '—'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <Badge variant="outline" className={statusClasses(d.status)}>
                            {d.status === 'pending' ? 'Offen' : d.status === 'approved' ? 'Freigegeben' : 'Abgelehnt'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: de })}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* RIGHT — detail */}
          <div className="overflow-y-auto">
            {!edit ? (
              <EmptyState />
            ) : (
              <div className="p-6 space-y-5 max-w-3xl">
                {/* Source email (collapsible) */}
                <div className="rounded-lg border border-border">
                  <button
                    onClick={() => setEmailOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/40 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {emailOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Mail className="h-4 w-4 text-muted-foreground" /> Quell-E-Mail
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                      {edit.source_email_subject}
                    </span>
                  </button>
                  {emailOpen && (
                    <div className="px-4 pb-4 pt-2 border-t border-border space-y-2 text-sm">
                      <div><span className="text-muted-foreground">Von:</span> {edit.source_email_from || '—'}</div>
                      <div><span className="text-muted-foreground">Betreff:</span> {edit.source_email_subject || '—'}</div>
                      <pre className="whitespace-pre-wrap text-xs bg-muted/50 rounded p-3 max-h-72 overflow-y-auto">
                        {edit.source_email_body || '(leer)'}
                      </pre>
                    </div>
                  )}
                </div>

                {/* MTIQ Vorschlag */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">MTIQ Vorschlag</h2>

                  <div>
                    <Label>Titel</Label>
                    <Input
                      value={edit.draft_title ?? ''}
                      onChange={e => handleField('draft_title', e.target.value)}
                      onBlur={persistAll}
                      disabled={edit.status !== 'pending'}
                    />
                  </div>

                  <div>
                    <Label>Beschreibung</Label>
                    <Textarea
                      value={edit.draft_description ?? ''}
                      onChange={e => handleField('draft_description', e.target.value)}
                      onBlur={persistAll}
                      rows={5}
                      disabled={edit.status !== 'pending'}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Abteilung</Label>
                      <Select
                        value={edit.draft_department ?? ''}
                        onValueChange={v => { handleField('draft_department', v); setTimeout(persistAll, 50); }}
                        disabled={edit.status !== 'pending'}
                      >
                        <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          {departments.map(d => (
                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priorität</Label>
                      <Select
                        value={edit.draft_priority ?? ''}
                        onValueChange={v => { handleField('draft_priority', v); setTimeout(persistAll, 50); }}
                        disabled={edit.status !== 'pending'}
                      >
                        <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fälligkeit</Label>
                      <Input
                        type="date"
                        value={edit.draft_due_date ?? ''}
                        onChange={e => handleField('draft_due_date', e.target.value || null)}
                        onBlur={persistAll}
                        disabled={edit.status !== 'pending'}
                        className="h-10 w-full appearance-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Tasks */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Unteraufgaben ({edit.draft_tasks.length})
                  </h2>
                  <div className="space-y-2">
                    {edit.draft_tasks.map((t, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Input
                            value={t.title}
                            onChange={e => updateTask(idx, { title: e.target.value })}
                            onBlur={persistAll}
                            placeholder="Aufgabe…"
                            disabled={edit.status !== 'pending'}
                            className="flex-1"
                          />
                          {edit.status === 'pending' && (
                            <Button variant="ghost" size="icon" onClick={() => deleteTask(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Select
                            value={t.department ?? ''}
                            onValueChange={v => { updateTask(idx, { department: v }); setTimeout(persistAll, 50); }}
                            disabled={edit.status !== 'pending'}
                          >
                            <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Abteilung" /></SelectTrigger>
                            <SelectContent>
                              {departments.map(d => (
                                <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={t.assignee_hint ?? ''}
                            onChange={e => updateTask(idx, { assignee_hint: e.target.value || null })}
                            onBlur={persistAll}
                            placeholder="Zuständigkeit (Hinweis)"
                            disabled={edit.status !== 'pending'}
                            className="w-full min-w-0"
                          />
                          <Input
                            type="date"
                            value={t.due_date ?? ''}
                            onChange={e => updateTask(idx, { due_date: e.target.value || null })}
                            onBlur={persistAll}
                            disabled={edit.status !== 'pending'}
                            className="h-10 w-full min-w-0 appearance-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {edit.status === 'pending' && (
                    <Button variant="outline" size="sm" onClick={addTask}>
                      <Plus className="h-4 w-4 mr-1" /> Aufgabe hinzufügen
                    </Button>
                  )}
                </div>

                {/* Reasoning */}
                {edit.mtiq_reasoning && (
                  <div className="rounded-lg bg-muted/40 border border-border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Warum hat MTIQ das so strukturiert?
                    </div>
                    <p className="text-sm italic text-muted-foreground">{edit.mtiq_reasoning}</p>
                  </div>
                )}

                {/* Actions */}
                {edit.status === 'pending' ? (
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-6 px-6 border-t border-border">
                    <Button
                      onClick={approve}
                      disabled={approving || rejecting}
                      className="flex-1 h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      {approving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
                      Freigeben & Vorgang anlegen
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmReject(true)}
                      disabled={approving || rejecting}
                      className="h-12 sm:w-48"
                    >
                      Ablehnen
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    Status: {edit.status === 'approved' ? 'Freigegeben' : 'Abgelehnt'}
                    {edit.vorgang_id && (
                      <Button
                        variant="link" className="ml-2 p-0 h-auto"
                        onClick={() => navigate(`/cases/${edit.vorgang_id}`)}
                      >
                        Zum Vorgang
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {/* Reject confirm */}
        <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Entwurf ablehnen?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Entwurf wird als abgelehnt markiert. Es wird kein Vorgang angelegt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rejecting}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={reject} disabled={rejecting}>
                {rejecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Ablehnen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function EmptyState() {
  return (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center px-8 py-16">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-base font-medium">Keine offenen Entwürfe</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        Sende eine E-Mail an <span className="font-mono">mtiq@inbox.kscommand.com</span> um einen Vorgang vorzubereiten.
      </p>
    </div>
  );
}
