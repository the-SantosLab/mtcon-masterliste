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
import { Loader2, Trash2, Plus, ChevronDown, ChevronRight, Inbox, Mail, Send, Users, User as UserIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

type TaskItem = {
  title: string;
  department: string | null;
  assignee_hint: string | null;
  assignee_id: string | null;
  due_date: string | null;
};

type Draft = {
  id: string;
  created_at: string;
  created_by: string | null;
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
  // Extended fields (match CreateCaseForm)
  draft_project_id: string | null;
  draft_template_id: string | null;
  draft_team_id: string | null;
  draft_assignee_id: string | null;
  draft_customer_no: string | null;
  draft_client_name: string | null;
  draft_product_code: string | null;
  draft_internal_area_code: string | null;
  draft_project_article_no: string | null;
  draft_received_at: string | null;
  draft_estimated_hours: number | string | null;
  draft_sop: string | null;
  draft_quantity: number | string | null;
  draft_project_duration: string | null;
  draft_note: string | null;
};

type DeptOpt = { id: string; name: string; parent_id: string | null };
type ProfileOpt = { id: string; display_name: string; short_code: string | null; department_id: string | null };
type ProjectOpt = { id: string; project_number: string; name: string };
type TemplateOpt = { id: string; title: string };
type CustomerOpt = { id: string; customer_no: string; name: string };
type ProductOpt = { id: string; code: string; name: string };
type AreaOpt = { id: string; code: string; name: string };

const PRIORITIES = ['Niedrig', 'Mittel', 'Hoch', 'Kritisch'] as const;

function priorityClasses(p: string | null): string {
  switch (p) {
    case 'Kritisch': return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30 backdrop-blur-md';
    case 'Hoch': return 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30 backdrop-blur-md';
    case 'Mittel': return 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30 backdrop-blur-md';
    case 'Niedrig': return 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 backdrop-blur-md';
    default: return 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 backdrop-blur-md';
  }
}

function statusClasses(s: string): string {
  switch (s) {
    case 'pending': return 'bg-primary/10 text-primary border-primary/30 backdrop-blur-md';
    case 'approved': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 backdrop-blur-md';
    case 'rejected': return 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 backdrop-blur-md';
    default: return 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 backdrop-blur-md';
  }
}

export default function MtiqDrafts() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DeptOpt[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, string>>({});
  // 'all' | 'mine' | a specific user id
  const [ownerFilter, setOwnerFilter] = useState<string>('mine');

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
    const sb: any = supabase;
    sb.from('departments').select('id, name, parent_id').eq('is_active', true).order('name').then(({ data }: any) => {
      setDepartments(data || []);
    });
    sb.from('users_profile').select('id, display_name, short_code, department_id').order('display_name').then(({ data }: any) => {
      setProfiles(data || []);
    });
    sb.from('projects').select('id, project_number, name').order('project_number', { ascending: false }).limit(500).then(({ data }: any) => {
      setProjects(data || []);
    });
    sb.from('case_templates').select('id, title').order('title').then(({ data }: any) => {
      setTemplates(data || []);
    });
    sb.from('customers').select('id, customer_no, name').order('name').then(({ data }: any) => {
      setCustomers(data || []);
    });
    sb.from('products').select('id, code, name').order('name').then(({ data }: any) => {
      setProducts(data || []);
    });
    sb.from('internal_areas').select('id, code, name').order('name').then(({ data }: any) => {
      setAreas(data || []);
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

  // Resolve display names for all draft owners (admins use this for the filter)
  useEffect(() => {
    const ids = Array.from(new Set(drafts.map(d => d.created_by).filter(Boolean))) as string[];
    const missing = ids.filter(id => !(id in ownerProfiles));
    if (missing.length === 0) return;
    (supabase as any)
      .from('users_profile')
      .select('id, display_name, short_code')
      .in('id', missing)
      .then(({ data }: any) => {
        if (!data) return;
        setOwnerProfiles(prev => {
          const next = { ...prev };
          for (const p of data) next[p.id] = p.display_name || p.short_code || p.id;
          return next;
        });
      });
  }, [drafts, ownerProfiles]);

  const visibleDrafts = useMemo(() => {
    if (!isAdmin) return drafts;
    if (ownerFilter === 'all') return drafts;
    if (ownerFilter === 'mine') return drafts.filter(d => d.created_by === user?.id);
    return drafts.filter(d => d.created_by === ownerFilter);
  }, [drafts, isAdmin, ownerFilter, user?.id]);

  // Keep selection valid when filter changes
  useEffect(() => {
    if (selectedId && !visibleDrafts.find(d => d.id === selectedId)) {
      const firstPending = visibleDrafts.find(d => d.status === 'pending');
      setSelectedId((firstPending ?? visibleDrafts[0])?.id ?? null);
    }
  }, [visibleDrafts, selectedId]);

  const pendingCount = useMemo(() => visibleDrafts.filter(d => d.status === 'pending').length, [visibleDrafts]);

  const ownerOptions = useMemo(() => {
    const ids = Array.from(new Set(drafts.map(d => d.created_by).filter(Boolean))) as string[];
    return ids
      .map(id => ({ id, name: ownerProfiles[id] || id.slice(0, 8) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drafts, ownerProfiles]);

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
    const toNum = (v: any) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    await saveEdits({
      draft_title: edit.draft_title,
      draft_description: edit.draft_description,
      draft_department: edit.draft_department,
      draft_priority: edit.draft_priority,
      draft_due_date: edit.draft_due_date,
      draft_tasks: edit.draft_tasks as any,
      draft_project_id: edit.draft_project_id || null,
      draft_template_id: edit.draft_template_id || null,
      draft_team_id: edit.draft_team_id || null,
      draft_assignee_id: edit.draft_assignee_id || null,
      draft_customer_no: edit.draft_customer_no || null,
      draft_client_name: edit.draft_client_name || null,
      draft_product_code: edit.draft_product_code || null,
      draft_internal_area_code: edit.draft_internal_area_code || null,
      draft_project_article_no: edit.draft_project_article_no || null,
      draft_received_at: edit.draft_received_at || null,
      draft_estimated_hours: toNum(edit.draft_estimated_hours) as any,
      draft_sop: edit.draft_sop || null,
      draft_quantity: toNum(edit.draft_quantity) as any,
      draft_project_duration: edit.draft_project_duration || null,
      draft_note: edit.draft_note || null,
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
    const next = [...edit.draft_tasks, { title: '', department: null, assignee_hint: null, assignee_id: null, due_date: null }];
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

        <div className="px-6 py-5 border-b border-border dark:border-white/5 bg-background/40 backdrop-blur-xl flex items-start justify-between gap-4 flex-wrap">
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

          {isAdmin && (
            <div className="flex items-center gap-2 ml-auto">
              {/* Segmented toggle: Meine / Alle */}
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-1">
                <button
                  onClick={() => setOwnerFilter('mine')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ownerFilter === 'mine'
                      ? 'bg-primary/20 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UserIcon className="h-3.5 w-3.5" /> Nur meine
                </button>
                <button
                  onClick={() => setOwnerFilter('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ownerFilter === 'all'
                      ? 'bg-primary/20 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" /> Alle
                </button>
              </div>

              {/* Specific user picker */}
              <Select
                value={ownerFilter === 'all' || ownerFilter === 'mine' ? '' : ownerFilter}
                onValueChange={(v) => setOwnerFilter(v)}
              >
                <SelectTrigger className="h-9 w-[180px] bg-white/[0.03] border-white/10 backdrop-blur-xl text-xs">
                  <SelectValue placeholder="Bestimmter Nutzer…" />
                </SelectTrigger>
                <SelectContent>
                  {ownerOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Nutzer</div>
                  ) : ownerOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_3fr] min-h-0">
          {/* LEFT — list */}
          <div className="border-r border-border dark:border-white/5 overflow-y-auto bg-background/20 backdrop-blur-xl">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Lädt…</div>
            ) : visibleDrafts.length === 0 ? (
              <EmptyState filtered={isAdmin && ownerFilter !== 'all' && drafts.length > 0} />
            ) : (
              <ul className="p-3 space-y-2">
                {visibleDrafts.map(d => {
                  const active = d.id === selectedId;
                  return (
                    <li key={d.id}>
                      <button
                        onClick={() => setSelectedId(d.id)}
                        className={`group w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                          active
                            ? 'bg-primary/10 border-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_8px_24px_-8px_hsl(var(--primary)/0.3)]'
                            : 'bg-neutral-50/80 dark:bg-white/[0.02] border-neutral-200/60 dark:border-white/5 hover:bg-neutral-100 dark:hover:bg-white/[0.04] hover:border-neutral-300 dark:hover:border-white/10'
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
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge variant="outline" className={statusClasses(d.status)}>
                              {d.status === 'pending' ? 'Offen' : d.status === 'approved' ? 'Freigegeben' : 'Abgelehnt'}
                            </Badge>
                            {isAdmin && ownerFilter === 'all' && d.created_by && d.created_by !== user?.id && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-neutral-100 dark:bg-white/[0.04] border border-neutral-200 dark:border-white/10 rounded-md px-1.5 py-0.5 truncate">
                                <UserIcon className="h-2.5 w-2.5" />
                                {ownerProfiles[d.created_by] || '…'}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
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
          <div className="overflow-y-auto bg-background/10 backdrop-blur-xl">
            {!edit ? (
              <EmptyState />
            ) : (
              <div className="p-6 space-y-5 max-w-3xl">
                {/* Source email (collapsible) */}
                <div className="rounded-2xl border border-border dark:border-white/10 bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                  <button
                    onClick={() => setEmailOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.03] transition-colors rounded-2xl"
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
                    <div className="px-4 pb-4 pt-2 border-t border-border dark:border-white/5 space-y-2 text-sm">
                      <div><span className="text-muted-foreground">Von:</span> {edit.source_email_from || '—'}</div>
                      <div><span className="text-muted-foreground">Betreff:</span> {edit.source_email_subject || '—'}</div>
                      <pre className="whitespace-pre-wrap text-xs bg-neutral-100 dark:bg-black/30 border border-border dark:border-white/5 rounded-xl p-3 max-h-72 overflow-y-auto">
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

                {/* Erweiterte Vorgangs-Felder (analog zum manuellen Anlegen) */}
                {(() => {
                  const disabled = edit.status !== 'pending';
                  const topDepts = departments.filter(d => !d.parent_id);
                  const selectedTopDept = topDepts.find(d => d.name === (edit.draft_department ?? ''));
                  const teamOptions = departments.filter(d => selectedTopDept && d.parent_id === selectedTopDept.id);
                  const teamForFilter = edit.draft_team_id
                    ? departments.find(d => d.id === edit.draft_team_id)
                    : selectedTopDept;
                  const assigneeOptions = teamForFilter
                    ? profiles.filter(p => p.department_id === teamForFilter.id || !p.department_id)
                    : profiles;
                  return (
                    <div className="space-y-4">
                      {/* Projekt & Vorlage */}
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projekt & Vorlage</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label>Bestehendem Projekt zuordnen</Label>
                            <Select
                              value={edit.draft_project_id ?? '__none__'}
                              onValueChange={v => { handleField('draft_project_id', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Kein Projekt —</SelectItem>
                                {projects.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.project_number} · {p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Aus Vorlage erstellen</Label>
                            <Select
                              value={edit.draft_template_id ?? '__none__'}
                              onValueChange={v => { handleField('draft_template_id', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Keine Vorlage" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Keine Vorlage —</SelectItem>
                                {templates.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {edit.draft_template_id && (
                          <p className="text-[11px] text-muted-foreground -mt-1">
                            Hinweis: Bei gewählter Vorlage werden deren Unteraufgaben & Workflow-Einstellungen übernommen — die MTIQ-Vorschläge unten werden dann ignoriert.
                          </p>
                        )}
                      </div>

                      {/* Zuständigkeit */}
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Zuständigkeit</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label>Team / Unterabteilung</Label>
                            <Select
                              value={edit.draft_team_id ?? '__none__'}
                              onValueChange={v => { handleField('draft_team_id', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled || !selectedTopDept}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={selectedTopDept ? 'Optional…' : 'Erst Abteilung wählen'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Keines —</SelectItem>
                                {teamOptions.map(d => (
                                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Mitarbeiter</Label>
                            <Select
                              value={edit.draft_assignee_id ?? '__none__'}
                              onValueChange={v => { handleField('draft_assignee_id', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Abteilungspool" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Abteilungspool —</SelectItem>
                                {assigneeOptions.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.display_name}{p.short_code ? ` (${p.short_code})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* Kunde & Produkt */}
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Kunde & Produkt</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label>Kunde (Stammdaten)</Label>
                            <Select
                              value={edit.draft_customer_no ?? '__none__'}
                              onValueChange={v => {
                                if (v === '__none__') handleField('draft_customer_no', null);
                                else handleField('draft_customer_no', v);
                                setTimeout(persistAll, 50);
                              }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Kein Kunde —</SelectItem>
                                {customers.map(c => (
                                  <SelectItem key={c.id} value={c.customer_no}>{c.customer_no} · {c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Auftraggeber (Freitext)</Label>
                            <Input
                              value={edit.draft_client_name ?? ''}
                              onChange={e => handleField('draft_client_name', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label>Produkt</Label>
                            <Select
                              value={edit.draft_product_code ?? '__none__'}
                              onValueChange={v => { handleField('draft_product_code', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Kein Produkt —</SelectItem>
                                {products.map(p => (
                                  <SelectItem key={p.id} value={p.code}>{p.code} · {p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Interner Bereich</Label>
                            <Select
                              value={edit.draft_internal_area_code ?? '__none__'}
                              onValueChange={v => { handleField('draft_internal_area_code', v === '__none__' ? null : v); setTimeout(persistAll, 50); }}
                              disabled={disabled}
                            >
                              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Keiner —</SelectItem>
                                {areas.map(a => (
                                  <SelectItem key={a.id} value={a.code}>{a.code} · {a.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Projekt-/Artikelnummer</Label>
                            <Input
                              value={edit.draft_project_article_no ?? ''}
                              onChange={e => handleField('draft_project_article_no', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Termine & Details */}
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Termine & Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label>Auftragseingang</Label>
                            <Input
                              type="date"
                              value={edit.draft_received_at ?? ''}
                              onChange={e => handleField('draft_received_at', e.target.value || null)}
                              onBlur={persistAll}
                              disabled={disabled}
                              className="h-10 w-full appearance-none"
                            />
                          </div>
                          <div>
                            <Label>Geschätzte Stunden</Label>
                            <Input
                              type="number"
                              step="0.25"
                              min="0"
                              value={edit.draft_estimated_hours ?? ''}
                              onChange={e => handleField('draft_estimated_hours', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                            />
                          </div>
                          <div>
                            <Label>SOP</Label>
                            <Input
                              value={edit.draft_sop ?? ''}
                              onChange={e => handleField('draft_sop', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                            />
                          </div>
                          <div>
                            <Label>Stückzahl</Label>
                            <Input
                              type="number"
                              min="0"
                              value={edit.draft_quantity ?? ''}
                              onChange={e => handleField('draft_quantity', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Projektdauer</Label>
                            <Input
                              value={edit.draft_project_duration ?? ''}
                              onChange={e => handleField('draft_project_duration', e.target.value)}
                              onBlur={persistAll}
                              disabled={disabled}
                              placeholder="z. B. 6 Monate"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Bemerkung */}
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bemerkung</h2>
                        <Textarea
                          value={edit.draft_note ?? ''}
                          onChange={e => handleField('draft_note', e.target.value)}
                          onBlur={persistAll}
                          rows={3}
                          disabled={disabled}
                          placeholder="Wird beim Anlegen als angepinnte Notiz gespeichert."
                        />
                      </div>
                    </div>
                  );
                })()}


                {/* Tasks */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Unteraufgaben ({edit.draft_tasks.length})
                  </h2>
                  <div className="space-y-2">
                    {edit.draft_tasks.map((t, idx) => (
                      <div key={idx} className="rounded-xl border border-border dark:border-white/10 bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl p-3 space-y-2 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.4)]">
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
                          <Select
                            value={t.assignee_id ?? '_none'}
                            onValueChange={v => { updateTask(idx, { assignee_id: v === '_none' ? null : v }); setTimeout(persistAll, 50); }}
                            disabled={edit.status !== 'pending'}
                          >
                            <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Zuständig" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Niemand</SelectItem>
                              {(() => {
                                const dept = t.department ? departments.find(d => d.name === t.department) : null;
                                const list = dept ? profiles.filter(p => p.department_id === dept.id) : profiles;
                                return list.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.display_name} ({p.short_code})</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
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
                  <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 backdrop-blur-xl p-4 shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.3)]">
                    <div className="text-xs uppercase tracking-wide text-primary/80 mb-1 font-medium">
                      Warum hat MTIQ das so strukturiert?
                    </div>
                    <p className="text-sm italic text-muted-foreground">{edit.mtiq_reasoning}</p>
                  </div>
                )}

                {/* Actions */}
                {edit.status === 'pending' ? (
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 sticky bottom-0 bg-background/70 backdrop-blur-2xl py-3 -mx-6 px-6 border-t border-border dark:border-white/10">
                    <Button
                      onClick={approve}
                      disabled={approving || rejecting}
                      className="flex-1 h-12 text-base font-semibold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] border border-emerald-400/30"
                    >
                      {approving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
                      Freigeben & Vorgang anlegen
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmReject(true)}
                      disabled={approving || rejecting}
                      className="h-12 sm:w-48 bg-neutral-100 dark:bg-white/5 border border-border dark:border-white/10 backdrop-blur-xl hover:bg-neutral-200 dark:hover:bg-white/10"
                    >
                      Ablehnen
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border dark:border-white/10 bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-xl p-4 text-sm text-muted-foreground">
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

function EmptyState({ filtered = false }: { filtered?: boolean } = {}) {
  return (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center px-8 py-16">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-base font-medium">
        {filtered ? 'Keine Entwürfe im aktuellen Filter' : 'Keine offenen Entwürfe'}
      </h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        {filtered
          ? 'Wechsle oben zu „Alle", um Entwürfe anderer Nutzer einzusehen.'
          : <>Sende eine E-Mail an <span className="font-mono">mtiq@inbox.kscommand.com</span> um einen Vorgang vorzubereiten.</>}
      </p>
    </div>
  );
}
