import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { CaseNotes } from '@/components/CaseNotes';
import { CaseSubtasks } from '@/components/CaseSubtasks';
import { WatchersSection } from '@/components/WatchersSection';
import { useAuth } from '@/contexts/AuthContext';
import { useCaseActions } from '@/hooks/useCaseActions';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateTime, canClaim, isTerminalStatus, STATUS_LABELS } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { ArrowLeft, Building2, UserCheck, FolderKanban, Trash2, CalendarIcon, Pencil } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

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
  const [c, setCase] = useState<CaseWithRels | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  const deleteCase = async () => {
    if (!c) return;
    const { error } = await supabase.from('cases').delete().eq('id', c.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success(`Vorgang ${c.case_no} gelöscht`);
    navigate('/cases');
  };

  const fetchCase = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code), creator:users_profile!cases_created_by_fkey(display_name, short_code), project:projects!cases_project_id_fkey(id, project_number, name), department:departments!cases_department_id_fkey(id, name)')
      .eq('id', id)
      .single();
    if (data) {
      setCase(data as CaseWithRels);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCase(); }, [id]);

  useEffect(() => {
    supabase.from('departments').select('id, name, code, parent_id').eq('is_active', true).order('sort_order')
      .then(r => setDepartments((r.data || []) as DeptOption[]));
    supabase.from('users_profile').select('id, display_name, short_code, department_id').eq('active', true).order('display_name')
      .then(r => setProfiles((r.data || []) as ProfileOption[]));
    supabase.from('projects').select('id, name, project_number, department_id, status').order('name')
      .then(r => setProjectOptions((r.data || []) as ProjectOption[]));
  }, []);

  const refresh = () => { fetchCase(); setRefreshKey(k => k + 1); };
  const { claimCase, unclaimCase, completeCase } = useCaseActions(user?.id, refresh);

  const canEdit = !isViewer && (isAdmin || c?.assignee_id === user?.id);
  const canEditDueDate = !isViewer && (isAdmin || !!profile?.is_manager);
  const [dueOpen, setDueOpen] = useState(false);

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
                {canEditDueDate ? (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
                      Endtermin
                      {c.due_date_corrected_at && <span className="text-[10px] italic opacity-70">(korrigiert)</span>}
                    </p>
                    <Popover open={dueOpen} onOpenChange={setDueOpen}>
                      <PopoverTrigger asChild>
                        <button className="text-[13px] text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 group">
                          <span>{formatDate(c.due_at) || '–'}</span>
                          <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100" />
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
                  <Field label="Endtermin" value={formatDate(c.due_at)} />
                )}
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
                        const inDept = deptId ? profiles.filter(p => p.department_id && deptIds.has(p.department_id)) : [];
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
            <CaseSubtasks caseId={c.id} canEdit={!isViewer && !isTerminalStatus(c.status)} userId={user?.id || ''} />

            {/* Attachments */}
            <div className="rounded-md border border-border bg-card p-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Anhänge</h3>
              <FileAttachments
                bucket="case-attachments"
                folder={`cases/${c.id}`}
                canUpload={!isViewer && !isTerminalStatus(c.status)}
                canDelete={!isViewer}
              />
            </div>

            {/* Ticket-Verlauf / Notiz */}
            {c.note && (
              <div className="rounded-md border border-border bg-card p-5 space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {c.note.includes('--- Ticket-Verlauf:') ? 'Ticket-Verlauf' : 'Notiz'}
                </h3>
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
