import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { CaseChat } from '@/components/CaseChat';
import { UrgencyPicker } from '@/components/UrgencyPicker';
import { CaseNotes } from '@/components/CaseNotes';
import { CaseEmails } from '@/components/CaseEmails';
import { CaseSubtasks } from '@/components/CaseSubtasks';
import { CaseBlockedBanner } from '@/components/CaseBlockedBanner';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateCaseForm } from '@/components/CreateCaseForm';
import { CompleteCaseDialog } from '@/components/CompleteCaseDialog';
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { buildAllDayIcs, downloadIcs } from '@/lib/ics';
import { NotificationCockpit } from '@/components/NotificationCockpit';
import { NotifyToggle } from '@/components/NotifyToggle';
import { useNotificationLog } from '@/hooks/useNotificationLog';
import { CaseConflictDialog } from '@/components/CaseConflictDialog';
import { BugReportDialog } from '@/components/BugReportDialog';
import { Bug } from 'lucide-react';

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
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [sendStatusEmail, setSendStatusEmail] = useState(true);
  const [hasUrgentSubtasks, setHasUrgentSubtasks] = useState(false);
  const { lastByType, refresh: refreshLog } = useNotificationLog(id, refreshKey);
  const navigate = useNavigate();

  // Optimistic locking: track pending update so user can decide on conflict
  const [conflict, setConflict] = useState<{ patch: Record<string, any>; afterSuccess?: () => Promise<void> | void } | null>(null);

  /**
   * Perform a version-checked update on `cases`. Returns true on success.
   * If the version no longer matches (someone else saved first), opens the
   * conflict dialog and returns false. On success, the local case state is
   * updated with the fields returned from the database (including new version).
   */
  const updateCaseOptimistic = async (
    patch: Record<string, any>,
    afterSuccess?: () => Promise<void> | void,
  ): Promise<boolean> => {
    if (!c) return false;
    const currentVersion = (c as any).version ?? 1;
    const { data, error } = await supabase
      .from('cases')
      .update(patch as any)
      .eq('id', c.id)
      .eq('version', currentVersion)
      .select('*')
      .maybeSingle();
    if (error) {
      toast.error('Fehler: ' + error.message);
      return false;
    }
    if (!data) {
      // Version mismatch → conflict
      setConflict({ patch, afterSuccess });
      return false;
    }
    setCase(prev => prev ? ({ ...prev, ...(data as any) }) : prev);
    if (afterSuccess) await afterSuccess();
    return true;
  };

  const resolveConflictReload = async () => {
    setConflict(null);
    await fetchCase();
    toast.info('Aktuelle Version geladen');
  };

  const resolveConflictForceSave = async () => {
    if (!c || !conflict) return;
    // Refetch latest version, then retry update without version filter mismatch
    const { data: latest } = await supabase
      .from('cases').select('version').eq('id', c.id).maybeSingle();
    const latestVersion = (latest as any)?.version;
    if (!latestVersion) { setConflict(null); return; }
    const { data, error } = await supabase
      .from('cases')
      .update(conflict.patch as any)
      .eq('id', c.id)
      .eq('version', latestVersion)
      .select('*')
      .maybeSingle();
    if (error || !data) {
      toast.error('Erneuter Konflikt – bitte Seite neu laden');
      setConflict(null);
      await fetchCase();
      return;
    }
    setCase(prev => prev ? ({ ...prev, ...(data as any) }) : prev);
    const after = conflict.afterSuccess;
    setConflict(null);
    if (after) await after();
    toast.success('Änderungen gespeichert (überschrieben)');
  };

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

  const duplicateCase = () => {
    if (!c || !user) return;
    setDuplicateOpen(true);
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

  // Track whether any subtask carries a chili — drives "abgeleitet" UI for case urgency
  useEffect(() => {
    if (!id) return;
    const loadFlag = async () => {
      const { count } = await (supabase as any)
        .from('case_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', id)
        .is('archived_at', null)
        .gt('urgency', 0);
      setHasUrgentSubtasks((count ?? 0) > 0);
    };
    void loadFlag();
    const ch = supabase.channel(`case-urg-flag-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks', filter: `case_id=eq.${id}` }, () => { void loadFlag(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refreshKey]);

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
  const [bugDialogOpen, setBugDialogOpen] = useState(false);

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
    const ok = await updateCaseOptimistic({
      project_name: next,
      last_changed_by: user?.id,
      last_changed_at: new Date().toISOString(),
    });
    setTitleSaving(false);
    if (!ok) return;
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
    const ok = await updateCaseOptimistic({
      due_at: newIso,
      due_date_corrected_by: user.id,
      due_date_corrected_at: nowIso,
      last_changed_by: user.id,
      last_changed_at: nowIso,
    }, async () => {
      await supabase.from('case_activity').insert({
        case_id: c.id, action: 'DUE_DATE_CHANGE', field: 'due_at',
        old_value: oldVal, new_value: newIso, actor_id: user.id,
      });
    });
    if (!ok) return;
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

    const ok = await updateCaseOptimistic({
      department_id: resolvedId,
      assignee_id: null,
      status: 'nicht_begonnen' as Enums<'case_status'>,
      started_at: null,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }, async () => {
      await supabase.from('case_activity').insert({
        case_id: c.id, action: 'DEPT_MOVE', field: 'department_id',
        old_value: oldDeptName, new_value: newDeptName, actor_id: user.id,
      });
    });
    if (!ok) return;

    toast.success(`Abteilung geändert: ${newDeptName}`);
    refresh();
  };

  const changeProject = async (newProjectId: string) => {
    if (!c || !user) return;
    const resolvedId = newProjectId === '_none' ? null : newProjectId;
    const oldProjectName = c.project ? `${c.project.project_number || ''} ${c.project.name}`.trim() : 'Keines';
    const newProject = projectOptions.find(p => p.id === resolvedId);
    const newProjectName = newProject ? `${newProject.project_number || ''} ${newProject.name}`.trim() : 'Keines';

    const ok = await updateCaseOptimistic({
      project_id: resolvedId,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }, async () => {
      await supabase.from('case_activity').insert({
        case_id: c.id, action: 'PROJECT_MOVE', field: 'project_id',
        old_value: oldProjectName, new_value: newProjectName, actor_id: user.id,
      });
    });
    if (!ok) return;

    toast.success(`Projekt geändert: ${newProjectName}`);
    refresh();
  };

  const assignCase = async (newAssigneeId: string) => {
    if (!c || !user) return;
    const resolvedId = newAssigneeId === '_none' ? null : newAssigneeId;
    const oldAssignee = c.assignee?.short_code || 'Niemand';
    const newAssignee = profiles.find(p => p.id === resolvedId);
    const newAssigneeName = newAssignee?.short_code || 'Niemand';

    const ok = await updateCaseOptimistic({
      assignee_id: resolvedId,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }, async () => {
      await supabase.from('case_activity').insert({
        case_id: c.id, action: resolvedId ? 'ASSIGN' : 'UNASSIGN', field: 'assignee_id',
        old_value: oldAssignee, new_value: newAssigneeName, actor_id: user.id,
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
    });
    if (!ok) return;

    toast.success(resolvedId ? `Zugewiesen an ${newAssigneeName}` : 'Zuweisung entfernt');
    refresh();
  };


  const changeStatus = async (newStatus: string) => {
    if (!c || !user) return;
    if (newStatus === 'abgeschlossen') { setCompleteOpen(true); return; }
    const old = c.status;
    const wasCompleted = old === 'abgeschlossen';
    const ok = await updateCaseOptimistic({
      status: newStatus as Enums<'case_status'>,
      ...(wasCompleted ? { completed_at: null, closed_at: null, closed_by: null } : {}),
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }, async () => {
      await supabase.from('case_activity').insert({ case_id: c.id, action: 'STATUS_CHANGE', field: 'status', old_value: old, new_value: newStatus, actor_id: user.id });

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

      if (newStatus === 'in_arbeit' && old !== 'in_arbeit' && sendStatusEmail) {
        supabase.functions.invoke('notify-vorgang-abgeholt', { body: { caseId: c.id, actorId: user.id } })
          .then(() => setTimeout(() => refreshLog(), 1500))
          .catch(() => {});
      }
    });
    if (!ok) return;

    toast.success('Status geändert');
    refresh();
  };

  const reopenCase = async () => {
    if (!c || !user || !isAdmin) return;
    const old = c.status;
    const ok = await updateCaseOptimistic({
      status: 'in_arbeit' as Enums<'case_status'>,
      completed_at: null,
      closed_at: null,
      closed_by: null,
      last_changed_by: user.id,
      last_changed_at: new Date().toISOString(),
    }, async () => {
      await supabase.from('case_activity').insert({
        case_id: c.id, action: 'REOPEN', field: 'status',
        old_value: old, new_value: 'in_arbeit', actor_id: user.id,
        message: 'Vorgang durch Admin wieder geöffnet',
      });
    });
    if (!ok) return;
    toast.success('Vorgang wieder geöffnet');
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
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-muted-foreground font-mono">{c.case_no}</p>
              <span className="text-[10px] text-muted-foreground">Dringlichkeit:</span>
              <UrgencyPicker
                value={(c as any).urgency}
                table="cases"
                rowId={c.id}
                readOnly={isViewer || isTerminalStatus(c.status)}
                size="sm"
                derived={hasUrgentSubtasks}
                overridden={!!(c as any).urgency_override}
                canOverride={isAdmin}
              />
            </div>
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
              lastSentAt={lastByType['vorgang_abgeschlossen']}
              onConfirm={async (note, sendEmail) => {
                await completeCase(c.id, note, sendEmail);
                setRefreshKey(k => k + 1);
                setTimeout(() => refreshLog(), 1500);
              }}
            />
            {canEdit && (
              <Button variant="outline" size="sm" onClick={duplicateCase} className="h-8 text-xs gap-1.5">
                <Copy className="h-3.5 w-3.5" />Duplizieren
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBugOpen(true)} className="h-8 text-xs gap-1.5">
              <Bug className="h-3.5 w-3.5" />Problem melden
            </Button>
            <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} caseId={c.id} caseNo={c.case_no || c.case_number?.toString()} />
            <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-sm font-semibold">Vorgang duplizieren</DialogTitle>
                </DialogHeader>
                <CreateCaseForm
                  userId={user?.id || ''}
                  prefill={{
                    project_name: `Kopie – ${c.project_name}`,
                    project_id: c.project_id || '',
                    department_id: c.department_id || '',
                    customer_no: c.customer_no || '',
                    client_name: c.client_name || '',
                    internal_area_code: c.internal_area_code || '',
                    product_code: c.product_code || '',
                    project_article_no: c.project_article_no || '',
                    sop: c.sop || '',
                    quantity: c.quantity != null ? String(c.quantity) : '',
                    project_duration: c.project_duration || '',
                    estimated_hours: c.estimated_hours != null ? String(c.estimated_hours) : '',
                    note: c.note || '',
                    received_at: new Date().toISOString().slice(0, 10),
                  }}
                  onCreated={() => {
                    setDuplicateOpen(false);
                    toast.success('Vorgang wurde dupliziert');
                  }}
                />
              </DialogContent>
            </Dialog>

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

        {c.status === 'blocked' && (
          <CaseBlockedBanner
            caseId={c.id}
            userId={user?.id || ''}
            canEdit={!isViewer}
            onChanged={refresh}
          />
        )}

        {isTerminalStatus(c.status) && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-amber-200">
                Vorgang eingefroren · {STATUS_LABELS[c.status]}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isAdmin
                  ? 'Du kannst diesen Vorgang als Admin wieder öffnen, um Änderungen zu erlauben.'
                  : 'Keine Änderungen möglich. Nur Admins können den Vorgang wieder öffnen.'}
              </p>
            </div>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">
                    Wieder öffnen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Vorgang wieder öffnen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vorgang {c.case_no} wird in den Status „In Arbeit" zurückgesetzt.
                      Abschlussdaten (completed_at, closed_at, closed_by) werden entfernt.
                      Die Aktion wird im Verlauf protokolliert.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={reopenCase}>Wieder öffnen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        <NotificationCockpit caseId={c.id} refreshKey={refreshKey} />



        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4 min-w-0 [&>div:nth-of-type(even)]:!bg-foreground/[0.08]">
            {(() => {
              const detailFields = [
                c.assignee?.short_code,
                c.customer_no,
                c.client_name,
                c.product_code,
                c.internal_area_code,
                c.project_article_no,
                c.estimated_hours?.toString(),
                c.creator?.short_code,
              ];
              const filledCount = detailFields.filter(v => v !== null && v !== undefined && v !== '').length + (c.project ? 1 : 0);
              const hasAny = filledCount > 0;
              return (
                <details className="rounded-md border border-border bg-card p-5 group" open={hasAny}>
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Details {!hasAny && <span className="ml-1 normal-case text-[10px] text-muted-foreground/70">(keine Angaben)</span>}
                    </h3>
                    <span className="text-muted-foreground text-xs transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mt-4">
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
                </details>
              );
            })()}

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
              <div className="rounded-md border border-border bg-card px-5 py-2 space-y-2">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status ändern</h3>
                <div className="flex flex-wrap items-end gap-4">
                  <Select value={c.status} onValueChange={changeStatus}>
                    <SelectTrigger className="w-[180px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.case_status.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <NotifyToggle
                    checked={sendStatusEmail}
                    onChange={setSendStatusEmail}
                    lastSentAt={lastByType['abgeholt']}
                    label='E-Mail bei „In Arbeit" an Ersteller'
                    recipientsHint="nur beim Wechsel auf In Arbeit"
                  />
                </div>
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
            <CaseSubtasks caseId={c.id} canEdit={!isViewer && !isTerminalStatus(c.status)} userId={user?.id || ''} sequentialMode={!!(c as any).sequential_mode} dueRequired={!!(c as any).due_required} lockMode={((c as any).lock_mode === 'soft' ? 'soft' : 'hard')} />

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
              <div className="rounded-md border border-border bg-card p-5 space-y-2 min-w-0 overflow-hidden">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ticket-Verlauf</h3>
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed font-sans max-w-full">{c.note}</pre>
              </div>
            )}

            <CaseNotes caseId={c.id} canEdit={!isViewer && !isTerminalStatus(c.status)} userId={user?.id || ''} isAdmin={isAdmin} refreshKey={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />
          </div>

          <div className="space-y-4">
            <CaseChat caseId={c.id} canWrite={!isViewer && !isTerminalStatus(c.status)} />
            <div className="rounded-md border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktivitäten</h3>
              </div>
              <ActivityTimeline caseId={c.id} refreshKey={refreshKey} />
            </div>
          </div>
        </div>

        {/* Version footer */}
        <div className="pt-2 text-[11px] text-muted-foreground">
          Version {(c as any).version ?? 1}
          {c.last_changed_at && (
            <>
              {' · Zuletzt gespeichert '}
              {formatDateTime(c.last_changed_at)}
              {(() => {
                const p = profiles.find(p => p.id === (c as any).last_changed_by);
                return p?.short_code ? ` von ${p.short_code}` : '';
              })()}
            </>
          )}
        </div>
      </div>

      <CaseConflictDialog
        open={!!conflict}
        onOpenChange={(o) => { if (!o) setConflict(null); }}
        onForceSave={resolveConflictForceSave}
        onReload={resolveConflictReload}
      />
    </AppLayout>

  );
}
