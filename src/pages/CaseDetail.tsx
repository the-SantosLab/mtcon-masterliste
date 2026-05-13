import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { CaseNotes } from '@/components/CaseNotes';
import { CaseEmails } from '@/components/CaseEmails';
import { CaseSubtasks } from '@/components/CaseSubtasks';
import { WatchersSection } from '@/components/WatchersSection';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCaseActions } from '@/hooks/useCaseActions';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateTime, canClaim, isTerminalStatus, STATUS_LABELS } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { ArrowLeft, Building2, UserCheck, FolderKanban, Trash2, CalendarIcon, Pencil, Copy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FileAttachments } from '@/components/FileAttachments';
import { CompleteCaseDialog } from '@/components/CompleteCaseDialog';
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { buildAllDayIcs, downloadIcs } from '@/lib/ics';

interface DeptOption { id: string; name: string; code: string | null; parent_id: string | null; }
interface ProfileOption { id: string; display_name: string; short_code: string; department_id: string | null; }
interface ProjectOption { id: string; name: string; project_number: string | null; department_id: string | null; status: string; }

type CaseWithRels = Tables<'cases'> & {
  assignee: { display_name: string; short_code: string } | null;
  creator: { display_name: string; short_code: string } | null;
  project: { id: string; project_number: string; name: string } | null;
  department: { id: string; name: string } | null;
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isViewer, profile } = useAuth();
  const { preferences } = usePreferences();
  const compactCls = preferences.compactTables ? 'lov-compact-region' : '';
  const [c, setCase] = useState<CaseWithRels | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [deptMembers, setDeptMembers] = useState<{ department_id: string; user_id: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dueChange, setDueChange] = useState<{ at: string; by_name: string | null } | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const navigate = useNavigate();

  const deleteCase = async () => {
    if (!c) return;
    try {
      const { data, error } = await supabase
        .from('cases')
        .update({
          deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        } as any)
        .eq('id', c.id)
        .eq('deleted', false)
        .select('id');
      if (error) {
        console.error('Soft-delete case failed:', error);
        const hint = error.code === '42501' ? ' Fehlende Berechtigung (RLS).' : '';
        toast.error(`Vorgang konnte nicht gelöscht werden: ${error.message}.${hint}`);
        return;
      }
      if (!data || data.length === 0) {
        toast.error('Vorgang konnte nicht gelöscht werden: keine Berechtigung oder bereits gelöscht.');
        return;
      }
      toast.success('Vorgang wurde in den Papierkorb verschoben');
      navigate('/cases');
    } catch (e: any) {
      console.error('Delete case exception:', e);
      toast.error(`Unerwarteter Fehler beim Löschen: ${e?.message ?? 'Unbekannt'}`);
    }
  };

  const duplicateCase = async () => {
    if (!c || !user) return;
    const today = new Date().toISOString().slice(0, 10);
    const payload: any = {
      project_name: `Kopie – ${c.project_name}`,
      client_name: c.client_name,
      customer_no: c.customer_no,
      project_article_no: c.project_article_no,
      quantity: c.quantity,
      sop: c.sop,
      project_id: c.project_id,
      department_id: c.department_id,
      project_duration: c.project_duration,
      estimated_hours: c.estimated_hours,
      note: c.note,
      internal_area_code: c.internal_area_code,
      product_code: c.product_code,
      visibility: c.visibility,
      watchers: c.watchers ?? [],
      status: 'nicht_begonnen',
      assignee_id: null,
      received_at: today,
      started_at: null,
      due_at: null,
      completed_at: null,
      closed_at: null,
      closed_by: null,
      created_by: user.id,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('cases').insert(payload).select('id, case_no').single();
    if (error) { toast.error('Fehler beim Duplizieren: ' + error.message); return; }
    toast.success('Vorgang wurde dupliziert');
    navigate(`/cases/${(data as any).id}`);
  };

  const fetchCase = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code), creator:users_profile!cases_created_by_fkey(display_name, short_code), project:projects!cases_project_id_fkey(id, project_number, name), department:departments!cases_department_id_fkey(id, name)')
      .eq('id', id)
      .eq('deleted', false)
      .single();
    if (data) {
      setCase(data as CaseWithRels);
    }
    setLoading(false);

    // Fetch latest "due_at changed" event (only counts when previous value existed)
    const { data: act } = await supabase
      .from('case_activity')
      .select('created_at, actor_id, old_value, new_value')
      .eq('case_id', id)
      .eq('field', 'due_at')
      .not('old_value', 'is', null)
      .neq('old_value', '')
      .order('created_at', { ascending: false })
      .limit(1);
    const ev = (act || [])[0];
    if (ev) {
      let by_name: string | null = null;
      if (ev.actor_id) {
        const { data: p } = await supabase
          .from('users_profile').select('display_name, short_code').eq('id', ev.actor_id).maybeSingle();
        by_name = (p as any)?.display_name || (p as any)?.short_code || null;
      }
      setDueChange({ at: ev.created_at, by_name });
    } else {
      setDueChange(null);
    }
  };

  useEffect(() => { fetchCase(); }, [id]);

  useEffect(() => {
    supabase.from('departments').select('id, name, code, parent_id').eq('is_active', true).order('sort_order')
      .then(r => setDepartments((r.data || []) as DeptOption[]));
    supabase.from('users_profile').select('id, display_name, short_code, department_id').eq('active', true).order('display_name')
      .then(r => setProfiles((r.data || []) as ProfileOption[]));
    supabase.from('projects').select('id, name, project_number, department_id, status').order('name')
      .then(r => setProjectOptions((r.data || []) as ProjectOption[]));
    (supabase as any).from('department_members').select('department_id, user_id')
      .then((r: any) => setDeptMembers((r.data || []) as { department_id: string; user_id: string }[]));
  }, []);

  const refresh = () => { fetchCase(); setRefreshKey(k => k + 1); };
  const { claimCase, unclaimCase, completeCase } = useCaseActions(user?.id, refresh);

  const canEdit = !isViewer && (isAdmin || c?.assignee_id === user?.id);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);

  const startEditTitle = () => {
    if (!c) return;
    setTitleDraft(c.project_name);
    setTitleEditing(true);
  };

  const saveTitle = async () => {
    if (!c) return;
    const next = titleDraft.trim();
    if (!next) return;
    if (next === c.project_name) { setTitleEditing(false); return; }
    setTitleSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('cases')
      .update({ project_name: next, last_changed_by: user?.id, last_changed_at: now })
      .eq('id', c.id);
    setTitleSaving(false);
    if (error) { toast.error('Titel konnte nicht gespeichert werden'); return; }
    setCase({ ...c, project_name: next });
    setTitleEditing(false);
    setRefreshKey(k => k + 1);
    toast.success('Titel aktualisiert');
  };
  const canEditDueDate = !isViewer && !isTerminalStatus(c?.status) && (isAdmin || !!profile?.is_manager || c?.created_by === user?.id || c?.assignee_id === user?.id);
  const [dueOpen, setDueOpen] = useState(false);
  const [sendIcs, setSendIcs] = useState(false);

  const changeDueDate = async (date: Date | undefined) => {
    if (!c || !user) return;
    const newIso = date ? format(date, 'yyyy-MM-dd') : null;
    if (newIso === c.due_at) { setDueOpen(false); return; }
    const oldVal = c.due_at;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('cases').update({
      due_at: newIso,
      due_date_corrected_by: user.id,
      due_date_corrected_at: nowIso,
      last_changed_by: user.id,
      last_changed_at: nowIso,
    }).eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    await supabase.from('case_activity').insert({
      case_id: c.id,
      action: 'DUE_DATE_CHANGE',
      field: 'due_at',
      old_value: oldVal,
      new_value: newIso,
      actor_id: user.id,
    });
    toast.success(newIso ? 'Endtermin gesetzt' : 'Endtermin entfernt');

    if (newIso && sendIcs) {
      const link = `${window.location.origin}/cases/${c.id}`;
      const ics = buildAllDayIcs({
        uid: `case-${c.id}-${Date.now()}@kscommand.com`,
        summary: `${c.case_no} – ${c.project_name}`,
        description: `Vorgang öffnen: ${link}`,
        url: link,
        dueDate: newIso,
        organizerName: profile?.display_name || undefined,
        organizerEmail: user.email || undefined,
      });
      downloadIcs(`${c.case_no}.ics`, ics);
    }

    setDueOpen(false);
    refresh();
  };

  const changeDepartment = async (newDeptId: string) => {
    if (!c || !user) return;
    const oldDeptName = c.department?.name || 'Keine';
    const resolvedId = newDeptId === '_none' ? null : newDeptId;
    const newDept = departments.find(d => d.id === resolvedId);
    const newDeptName = newDept?.name || 'Keine';

    const { error } = await supabase.from('cases').update({
      department_id: resolvedId,
      assignee_id: null,
      status: 'nicht_begonnen' as Enums<'case_status'>,
      started_at: null,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }).eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }

    await supabase.from('case_activity').insert({
      case_id: c.id,
      action: 'DEPT_MOVE',
      field: 'department_id',
      old_value: oldDeptName,
      new_value: newDeptName,
      actor_id: user.id,
    });

    toast.success(`Abteilung geändert: ${newDeptName}`);
    refresh();
  };

  const changeProject = async (newProjectId: string) => {
    if (!c || !user) return;
    const resolvedId = newProjectId === '_none' ? null : newProjectId;
    const oldProjectName = c.project ? `${c.project.project_number || ''} ${c.project.name}`.trim() : 'Keines';
    const newProject = projectOptions.find(p => p.id === resolvedId);
    const newProjectName = newProject ? `${newProject.project_number || ''} ${newProject.name}`.trim() : 'Keines';

    const { error } = await supabase.from('cases').update({
      project_id: resolvedId,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }).eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }

    await supabase.from('case_activity').insert({
      case_id: c.id,
      action: 'PROJECT_MOVE',
      field: 'project_id',
      old_value: oldProjectName,
      new_value: newProjectName,
      actor_id: user.id,
    });

    toast.success(`Projekt geändert: ${newProjectName}`);
    refresh();
  };

  const assignCase = async (newAssigneeId: string) => {
    if (!c || !user) return;
    const resolvedId = newAssigneeId === '_none' ? null : newAssigneeId;
    const oldAssignee = c.assignee?.short_code || 'Niemand';
    const newAssignee = profiles.find(p => p.id === resolvedId);
    const newAssigneeName = newAssignee?.short_code || 'Niemand';

    const { error } = await supabase.from('cases').update({
      assignee_id: resolvedId,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }).eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }

    await supabase.from('case_activity').insert({
      case_id: c.id,
      action: resolvedId ? 'ASSIGN' : 'UNASSIGN',
      field: 'assignee_id',
      old_value: oldAssignee,
      new_value: newAssigneeName,
      actor_id: user.id,
    });

    if (resolvedId && resolvedId !== user.id) {
      await supabase.from('notifications').insert({
        user_id: resolvedId,
        type: 'assignment',
        title: `Vorgang zugewiesen: ${c.case_no}`,
        body: c.project_name,
        href: `/cases/${c.id}`,
      });
    }

    toast.success(resolvedId ? `Zugewiesen an ${newAssigneeName}` : 'Zuweisung entfernt');
    refresh();
  };


  const changeStatus = async (newStatus: string) => {
    if (!c || !user) return;
    if (newStatus === 'abgeschlossen') {
      const { data: openTasks } = await supabase
        .from('case_tasks')
        .select('id')
        .eq('case_id', c.id)
        .neq('status', 'done');
      if (openTasks && openTasks.length > 0) {
        toast.error(`Vorgang kann nicht abgeschlossen werden: ${openTasks.length} offene Unteraufgabe(n)`);
        return;
      }
    }
    const old = c.status;
    const { error } = await supabase.from('cases').update({
      status: newStatus as Enums<'case_status'>,
      last_changed_by: user.id, last_changed_at: new Date().toISOString(),
      ...(newStatus === 'abgeschlossen' ? { completed_at: new Date().toISOString(), closed_by: user.id, closed_at: new Date().toISOString() } : {}),
    }).eq('id', c.id);
    if (error) { toast.error('Fehler'); return; }
    await supabase.from('case_activity').insert({ case_id: c.id, action: 'STATUS_CHANGE', field: 'status', old_value: old, new_value: newStatus, actor_id: user.id });

    // Notify creator and assignee (if different from actor)
    const notifyTargets = new Set<string>();
    if (c.created_by && c.created_by !== user.id) notifyTargets.add(c.created_by);
    if (c.assignee_id && c.assignee_id !== user.id) notifyTargets.add(c.assignee_id);
    const statusLabel = STATUS_LABELS[newStatus as Enums<'case_status'>] ?? newStatus;
    await Promise.all([...notifyTargets].map(uid =>
      supabase.from('notifications').insert({
        user_id: uid,
        type: 'status_change',
        title: `Status geändert: ${c.case_no}`,
        body: `${c.project_name} → ${statusLabel}`,
        href: `/cases/${c.id}`,
      })
    ));

    if (newStatus === 'in_arbeit' && old !== 'in_arbeit') {
      supabase.functions.invoke('notify-vorgang-abgeholt', { body: { caseId: c.id, actorId: user.id } }).catch(() => {});
    }

    toast.success('Status geändert');
    refresh();
  };

  if (loading) return <AppLayout><p className="text-xs text-muted-foreground">Laden</p></AppLayout>;
  if (!c) return <AppLayout><p className="text-xs text-destructive">Vorgang nicht gefunden</p></AppLayout>;

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-[13px] text-foreground">{value || '–'}</p>
    </div>
  );

  return (
    <AppLayout>
      <div className={cn('space-y-5 max-w-5xl', compactCls)}>
        <Link to="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />Zurück zur Liste
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {titleEditing ? (
                <input
                  autoFocus
                  value={titleDraft}
                  disabled={titleSaving}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => { if (titleDraft.trim()) saveTitle(); else setTitleEditing(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); if (titleDraft.trim()) saveTitle(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setTitleEditing(false); }
                  }}
                  className="text-lg font-semibold text-foreground bg-background border border-input rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-ring min-w-[280px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => canEdit && !isTerminalStatus(c.status) && startEditTitle()}
                  disabled={!canEdit || isTerminalStatus(c.status)}
                  className="group inline-flex items-center gap-2 text-left disabled:cursor-default"
                  title={canEdit && !isTerminalStatus(c.status) ? 'Titel bearbeiten' : undefined}
                >
                  <h1 className="text-lg font-semibold text-foreground">{c.project_name}</h1>
                  {canEdit && !isTerminalStatus(c.status) && (
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              )}
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
              <Button variant="outline" size="sm" onClick={() => setCompleteOpen(true)} className="h-8 text-xs">Abschließen</Button>
            )}
            <CompleteCaseDialog
              open={completeOpen}
              onOpenChange={setCompleteOpen}
              onConfirm={async (note) => { await completeCase(c.id, note); setRefreshKey(k => k + 1); }}
            />
            {canEdit && (
              <Button variant="outline" size="sm" onClick={duplicateCase} className="h-8 text-xs gap-1.5">
                <Copy className="h-3.5 w-3.5" />Duplizieren
              </Button>
            )}
            {isAdmin && (
              <SaveAsTemplateDialog
                caseId={c.id}
                defaultTitle={c.project_name}
                defaultDescription={c.note}
                defaultDepartmentId={c.department_id}
              />
            )}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Vorgang endgültig löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vorgang {c.case_no} wird unwiderruflich gelöscht. Verknüpfte Aktivitäten,
                      Notizen und Unteraufgaben gehen verloren. Anhänge im Speicher bleiben bestehen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteCase}>Endgültig löschen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                 {c.project && (
                   <div>
                     <p className="text-[11px] text-muted-foreground mb-0.5">Verknüpftes Projekt</p>
                     <Link
                       to={`/projects/${c.project.id}/files`}
                       className="text-sm text-primary hover:underline flex items-center gap-1"
                     >
                       <span className="font-mono text-[11px] text-muted-foreground">{c.project.project_number}</span>
                       <span className="ml-1">{c.project.name}</span>
                     </Link>
                   </div>
                 )}
               </div>
            </div>

            {/* Projektinformationen */}
            {((c as any).sop || (c as any).quantity || (c as any).project_duration) && (
              <div className="rounded-md border border-border bg-card p-5">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Projektinformationen</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <Field label="SOP" value={(c as any).sop} />
                  <Field label="Stückzahl" value={(c as any).quantity?.toString()} />
                  <Field label="Projektdauer" value={(c as any).project_duration} />
                </div>
              </div>
            )}

            <div className="rounded-md border border-border bg-card px-5 py-2">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Termine</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
                <Field label="Auftragseingang" value={formatDate(c.received_at)} />
                <Field label="Gestartet" value={formatDateTime(c.started_at)} />
                {(() => {
                  const showBadge = !!dueChange && !isTerminalStatus(c.status);
                  const badgeTitle = dueChange
                    ? `Endtermin wurde am ${formatDateTime(dueChange.at)}${dueChange.by_name ? ` von ${dueChange.by_name}` : ''} geändert`
                    : '';
                  const Badge = showBadge ? (
                    <span
                      title={badgeTitle}
                      className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0 text-[9px] font-medium leading-tight"
                    >
                      ⚠ Geändert
                    </span>
                  ) : null;
                  return canEditDueDate ? (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
                        Endtermin
                        {Badge}
                      </p>
                      <Popover open={dueOpen} onOpenChange={setDueOpen}>
                        <PopoverTrigger asChild>
                          <button className="text-[13px] text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 group">
                            <span>{formatDate(c.due_at) || '–'}</span>
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground dark:text-foreground/80 group-hover:text-primary transition-colors" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={c.due_at ? new Date(c.due_at) : undefined}
                            onSelect={changeDueDate}
                            initialFocus
                            className={cn('p-3 pointer-events-auto')}
                          />
                          <div className="border-t border-border px-3 py-2">
                            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                              <Checkbox
                                checked={sendIcs}
                                onCheckedChange={(v) => setSendIcs(v === true)}
                              />
                              <span>📅 Kalendereinladung zusenden</span>
                            </label>
                          </div>
                          {c.due_at && (
                            <div className="border-t border-border p-2">
                              <button
                                onClick={() => changeDueDate(undefined)}
                                className="w-full text-xs text-muted-foreground hover:text-destructive py-1 transition-colors"
                              >
                                Endtermin entfernen
                              </button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
                        Endtermin
                        {Badge}
                      </p>
                      <p className="text-[13px] text-foreground">{formatDate(c.due_at) || '–'}</p>
                    </div>
                  );
                })()}
                <Field label="Abgeschlossen" value={formatDateTime(c.completed_at)} />
              </div>
            </div>

            {canEdit && !isTerminalStatus(c.status) && (
              <div className="rounded-md border border-border bg-card px-5 py-2">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Status ändern</h3>
                <Select value={c.status} onValueChange={changeStatus}>
                  <SelectTrigger className="w-[180px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.case_status.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Assign to user */}
            {!isViewer && !isTerminalStatus(c.status) && (
              <div className="rounded-md border border-border bg-card px-5 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Bearbeiter zuweisen</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-[13px] text-muted-foreground">
                    Aktuell: <span className="text-foreground font-medium">{c.assignee ? `${c.assignee.short_code} – ${c.assignee.display_name}` : 'Niemand'}</span>
                  </div>
                  <Select value={c.assignee_id || '_none'} onValueChange={assignCase}>
                    <SelectTrigger className="w-[240px] h-8 text-xs"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Niemand – freigeben</SelectItem>
                      {(() => {
                        const deptId = c.department_id;
                        const deptIds = new Set<string>();
                        if (deptId) {
                          deptIds.add(deptId);
                          departments.filter(d => d.parent_id === deptId).forEach(d => deptIds.add(d.id));
                          const parent = departments.find(d => d.id === deptId);
                          if (parent?.parent_id) deptIds.add(parent.parent_id);
                        }
                        const memberIds = new Set(
                          deptMembers.filter(m => deptIds.has(m.department_id)).map(m => m.user_id)
                        );
                        const inDept = deptId ? profiles.filter(p => (p.department_id && deptIds.has(p.department_id)) || memberIds.has(p.id)) : [];
                        const others = profiles.filter(p => !inDept.includes(p));
                        return (
                          <>
                            {inDept.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase">Abteilung</div>
                                {inDept.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.short_code}</span>{p.display_name}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {others.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase">{inDept.length > 0 ? 'Andere' : 'Alle'}</div>
                                {others.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.short_code}</span>{p.display_name}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </SelectContent>
                  </Select>
                  {user && c.assignee_id !== user.id && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assignCase(user.id)}>
                      Mir zuweisen
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Department move */}
            {!isViewer && !isTerminalStatus(c.status) && (
              <div className="rounded-md border border-border bg-card px-5 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Abteilung verschieben</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[13px] text-muted-foreground">
                    Aktuell: <span className="text-foreground font-medium">{c.department?.name || 'Keine'}</span>
                    {!c.department_id && (() => {
                      const creator = profiles.find(p => p.id === c.created_by);
                      const fbDept = creator?.department_id ? departments.find(d => d.id === creator.department_id) : null;
                      if (fbDept) {
                        return <span className="ml-2 italic opacity-60" title="Stiller Fallback – nicht gespeichert">(via Ersteller: {fbDept.name})</span>;
                      }
                      return null;
                    })()}
                  </div>
                  <Select value={c.department_id || '_none'} onValueChange={changeDepartment}>
                    <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Abteilung wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Keine Abteilung</SelectItem>
                      {departments.filter(d => !d.parent_id).map(d => {
                        const children = departments.filter(ch => ch.parent_id === d.id);
                        return [
                          <SelectItem key={d.id} value={d.id}>
                            {d.code ? <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{d.code}</span> : null}{d.name}
                          </SelectItem>,
                          ...children.map(ch => (
                            <SelectItem key={ch.id} value={ch.id}>
                              <span className="ml-3">{ch.code ? <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{ch.code}</span> : null}{ch.name}</span>
                            </SelectItem>
                          )),
                        ];
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Project move */}
            {!isViewer && !isTerminalStatus(c.status) && (
              <div className="rounded-md border border-border bg-card px-5 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Projekt verschieben</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[13px] text-muted-foreground">
                    Aktuell: <span className="text-foreground font-medium">
                      {c.project ? `${c.project.project_number || ''} ${c.project.name}`.trim() : 'Keines'}
                    </span>
                  </div>
                  <Select value={c.project_id || '_none'} onValueChange={changeProject}>
                    <SelectTrigger className="w-[280px] h-8 text-xs"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Kein Projekt</SelectItem>
                      {projectOptions
                        .filter(p => p.status !== 'archived' || p.id === c.project_id)
                        .map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.project_number && <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{p.project_number}</span>}
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Watchers */}
            {!isViewer && (
              <WatchersSection
                caseId={c.id}
                watchers={(c.watchers as string[] | null) || []}
                profiles={profiles}
                canEdit={canEdit && !isTerminalStatus(c.status)}
                onChange={refresh}
              />
            )}

            {/* Tasks checklist */}
            <CaseSubtasks caseId={c.id} canEdit={!isViewer && !isTerminalStatus(c.status)} userId={user?.id || ''} sequentialMode={!!(c as any).sequential_mode} dueRequired={!!(c as any).due_required} />

            {/* Anhänge */}
            <div className="rounded-md border border-border bg-card p-5 space-y-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anhänge</h3>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Dateien</p>
                <FileAttachments
                  bucket="case-attachments"
                  folder={`cases/${c.id}`}
                  canUpload={!isViewer && !isTerminalStatus(c.status)}
                  canDelete={!isViewer}
                />
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">E-Mails</p>
                <CaseEmails caseId={c.id} />
              </div>
            </div>

            {/* Email-Adresse für diesen Vorgang */}
            <div className="rounded-md border border-border bg-card p-5 space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email an diesen Vorgang</h3>
              <p className="text-[11px] text-muted-foreground">Emails an diese Adresse landen automatisch hier — inklusive Anhängen.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted/40 border border-border rounded px-2 py-1.5 font-mono break-all">
                  vorgang+{c.case_no}@inbox.kscommand.com
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`vorgang+${c.case_no}@inbox.kscommand.com`);
                    toast.success('Adresse kopiert');
                  }}
                  className="text-xs px-2 py-1.5 rounded border border-border hover:bg-muted text-foreground"
                >
                  Kopieren
                </button>
              </div>
            </div>

            {/* Ticket-Verlauf */}
            {c.note && c.note.includes('--- Ticket-Verlauf:') && (
              <div className="rounded-md border border-border bg-card p-5 space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ticket-Verlauf</h3>
                <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{c.note}</pre>
              </div>
            )}

            <CaseNotes caseId={c.id} canEdit={!isViewer && !isTerminalStatus(c.status)} userId={user?.id || ''} isAdmin={isAdmin} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktivitäten</h3>
              </div>
              <ActivityTimeline caseId={c.id} refreshKey={refreshKey} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
