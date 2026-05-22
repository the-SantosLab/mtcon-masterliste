import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatRelativeTime, ACTION_LABELS } from '@/lib/case-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft, ChevronRight, FolderOpen, Users, Crown,
  CheckCircle2, AlertTriangle, XCircle, TrendingUp, BarChart3,
  Pencil, Check, X, Clock, Activity, Plus,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CreateCaseForm } from '@/components/CreateCaseForm';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { SortableHeader, type SortState, nextSort, sortBy } from '@/components/SortableHeader';

type PdCaseSortKey = 'status' | 'case_no' | 'project_name' | 'assignee' | 'due_at';

interface Project {
  id: string; project_number: string; project_code: string | null;
  name: string; description: string | null; status: string;
  visibility: string; created_at: string;
  department_id: string | null; owner_id: string | null; created_by: string;
}

interface CaseRow {
  id: string; case_no: string; project_name: string; status: string;
  assignee_id: string | null; due_at: string | null;
  assignee: { display_name: string; short_code: string } | null;
}

interface Member {
  id: string; user_id: string; role: string;
  profile: { display_name: string; short_code: string } | null;
}

interface Department { id: string; name: string; code: string; }

interface ProjectActivity {
  id: string;
  project_id: string;
  actor_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  message: string | null;
  created_at: string;
  actor: { display_name: string; short_code: string } | null;
}

const PROJECT_ACTION_LABELS: Record<string, string> = {
  EDIT: 'Geändert',
  CREATE: 'Erstellt',
  COMMENT: 'Kommentar',
  STATUS_CHANGE: 'Status geändert',
};

function ProjectActivityTimeline({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('project_activity')
      .select('*, actor:users_profile!project_activity_actor_id_fkey(display_name, short_code)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    setActivities((data as ProjectActivity[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel(`project-activity-${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_activity', filter: `project_id=eq.${projectId}` }, () => { fetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refreshKey, fetch]);

  if (loading) return <p className="text-xs text-muted-foreground p-4">Laden…</p>;
  if (activities.length === 0) return <p className="text-xs text-muted-foreground p-4">Keine Aktivitäten</p>;

  return (
    <div className="divide-y divide-border">
      {activities.map((a) => (
        <div key={a.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-xs font-medium text-foreground">
              {a.actor?.short_code || 'System'}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatRelativeTime(a.created_at)}
            </span>
          </div>
          {a.action === 'COMMENT' ? (
            <p className="text-xs text-foreground mt-1 whitespace-pre-wrap leading-relaxed">{a.message}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {PROJECT_ACTION_LABELS[a.action] || a.action}
              {a.field && (
                <span>
                  {' · '}<span className="font-medium text-foreground/70">{a.field}</span>
                  {a.old_value && <span className="line-through opacity-60"> {a.old_value}</span>}
                  {a.new_value && <span className="text-foreground"> → {a.new_value}</span>}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const CASE_STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen', in_planung: 'In Planung', in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug', abgeschlossen: 'Abgeschlossen', verworfen: 'Verworfen', archiv: 'Archiv',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv', completed: 'Abgeschlossen', archived: 'Archiviert',
};

const VISIBILITY_LABELS: Record<string, string> = {
  project_members: 'Nur Projektmitglieder',
  department: 'Abteilung',
  private: 'Privat',
};

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 flex items-center gap-3">
      <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', accent ?? 'bg-muted')}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-semibold text-foreground tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
}

// Inline-editable field
function EditableField({
  label, value, onSave, type = 'text', options, multiline, disabled,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>;
  type?: string; options?: { value: string; label: string }[];
  multiline?: boolean; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => { setDraft(value); setEditing(false); };

  return (
    <div className="group">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {!disabled && !editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          {options ? (
            <Select value={draft} onValueChange={setDraft}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : multiline ? (
            <Textarea
              value={draft} onChange={e => setDraft(e.target.value)}
              rows={3} className="text-xs resize-none" autoFocus
            />
          ) : (
            <Input
              value={draft} onChange={e => setDraft(e.target.value)}
              className="h-8 text-xs" autoFocus type={type}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            />
          )}
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-6 text-xs px-2 gap-1">
              <Check className="h-3 w-3" />{saving ? 'Speichern…' : 'Speichern'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving} className="h-6 text-xs px-2 gap-1">
              <X className="h-3 w-3" />Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground">{value || <span className="text-muted-foreground italic">–</span>}</p>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const { preferences } = usePreferences();
  const compact = preferences.compactTables;
  const cellCls = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs';

  const [project, setProject] = useState<Project | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<string>('all');
  const [caseAssigneeFilter, setCaseAssigneeFilter] = useState<string>('all');
  const [caseSort, setCaseSort] = useState<SortState<PdCaseSortKey>>({ column: 'due_at', direction: 'asc' });
  const handleCaseSort = (col: PdCaseSortKey) => setCaseSort(prev => nextSort(prev, col));

  const loadProject = async () => {
    if (!id) return;
    const { data } = await supabase.from('projects').select('*').eq('id', id).single();
    if (data) setProject(data as Project);
  };

  const reloadCases = async () => {
    if (!id) return;
    const { data } = await supabase.from('cases')
      .select('id, case_no, project_name, status, assignee_id, due_at, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .eq('project_id', id)
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    setCases((data || []) as CaseRow[]);
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('cases')
        .select('id, case_no, project_name, status, assignee_id, due_at, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
        .eq('project_id', id)
        .eq('deleted', false)
        .order('created_at', { ascending: false }),
      supabase.from('project_members').select('id, user_id, role').eq('project_id', id),
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true),
      supabase.from('departments').select('id, name, code'),
    ]).then(([projRes, casesRes, membersRes, profilesRes, deptRes]) => {
      if (projRes.data) setProject(projRes.data as Project);
      setCases((casesRes.data || []) as CaseRow[]);
      const profiles = (profilesRes.data || []) as { id: string; display_name: string; short_code: string }[];
      setMembers(
        ((membersRes.data || []) as { id: string; user_id: string; role: string }[]).map(m => ({
          ...m, profile: profiles.find(p => p.id === m.user_id) ?? null,
        }))
      );
      setDepartments((deptRes.data || []) as Department[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <AppLayout><div className="text-xs text-muted-foreground p-8">Laden…</div></AppLayout>;
  if (!project) return <AppLayout><div className="text-xs text-destructive p-8">Projekt nicht gefunden</div></AppLayout>;

  const dept = departments.find(d => d.id === project.department_id);
  const isOwner = project.owner_id === user?.id || project.created_by === user?.id;
  const canEdit = isAdmin || isOwner;

  // Stats
  const total = cases.length;
  const done = cases.filter(c => c.status === 'abgeschlossen').length;
  const open = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).length;
  const overdue = cases.filter(c => c.status === 'in_verzug').length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const statusGroups: { status: string; count: number; color: string }[] = [
    { status: 'in_arbeit', count: cases.filter(c => c.status === 'in_arbeit').length, color: 'bg-[hsl(var(--status-working))]' },
    { status: 'in_planung', count: cases.filter(c => c.status === 'in_planung').length, color: 'bg-[hsl(var(--status-planning))]' },
    { status: 'nicht_begonnen', count: cases.filter(c => c.status === 'nicht_begonnen').length, color: 'bg-muted-foreground/30' },
    { status: 'in_verzug', count: cases.filter(c => c.status === 'in_verzug').length, color: 'bg-[hsl(var(--status-overdue))]' },
    { status: 'abgeschlossen', count: done, color: 'bg-[hsl(var(--status-done))]' },
    { status: 'verworfen', count: cases.filter(c => ['verworfen', 'archiv'].includes(c.status)).length, color: 'bg-muted-foreground/20' },
  ].filter(g => g.count > 0);

  // Save handler — updates DB + logs activity
  const saveField = async (field: string, value: string, label: string) => {
    if (!project || !user) return;
    const oldValue = (project as any)[field] as string;
    const { error } = await supabase.from('projects').update({
      [field]: value,
      updated_at: new Date().toISOString(),
    }).eq('id', project.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    await supabase.from('project_activity').insert({
      project_id: project.id,
      actor_id: user.id,
      action: 'EDIT',
      field: label,
      old_value: oldValue || null,
      new_value: value,
    });
    toast.success(`${label} aktualisiert`);
    setActivityRefreshKey(k => k + 1);
    await loadProject();
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-6xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/projects" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />Projekte
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono">{project.project_number}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground truncate">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-semibold text-foreground truncate">{project.name}</h1>
              <span className={cn(
                'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                project.status === 'active' ? 'border-[hsl(var(--status-working))] text-[hsl(var(--status-working))] bg-[hsl(var(--status-working))]/10' :
                project.status === 'completed' ? 'border-[hsl(var(--status-done))] text-[hsl(var(--status-done))] bg-[hsl(var(--status-done))]/10' :
                'border-border text-muted-foreground'
              )}>
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
              </span>
              {canEdit && (
                <span className="text-[10px] text-muted-foreground border border-dashed border-border px-1.5 py-0.5 rounded">
                  Bearbeitbar
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="font-mono">{project.project_number}</span>
              {project.project_code && <span className="font-mono text-muted-foreground/60">{project.project_code}</span>}
              {dept && <><ChevronRight className="h-3 w-3" /><span>{dept.name}</span></>}
              <ChevronRight className="h-3 w-3" />
              <span>Erstellt {format(new Date(project.created_at), 'dd.MM.yyyy')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" />Vorgang hinzufügen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-sm font-semibold">
                    Neuen Vorgang anlegen
                    <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                      Verknüpft mit {project.project_number} – {project.name}
                    </span>
                  </DialogTitle>
                </DialogHeader>
                <CreateCaseForm
                  userId={user?.id || ''}
                  defaultProjectId={project.id}
                  onCreated={() => { setCreateOpen(false); reloadCases(); }}
                />
              </DialogContent>
            </Dialog>
            <Link to={`/projects/${project.id}/files`}>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />Dateiablage
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />} label="Vorgänge gesamt" value={total} accent="bg-muted" />
          <StatCard icon={<Clock className="h-4 w-4 text-[hsl(var(--status-working))]" />} label="Offen" value={open} accent="bg-[hsl(var(--status-working))]/10" />
          <StatCard icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--status-overdue))]" />} label="In Verzug" value={overdue} accent="bg-[hsl(var(--status-overdue))]/10" />
          <StatCard icon={<CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-done))]" />} label="Abgeschlossen" value={done} sub={total > 0 ? `${progress}% Fortschritt` : undefined} accent="bg-[hsl(var(--status-done))]/10" />
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="rounded-md border border-border bg-card px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />Fortschritt
              </p>
              <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-muted">
              {statusGroups.map(g => (
                <div key={g.status} className={cn('h-full transition-all', g.color)} style={{ width: `${(g.count / total) * 100}%` }} title={`${CASE_STATUS_LABELS[g.status]}: ${g.count}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {statusGroups.map(g => (
                <span key={g.status} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-full', g.color)} />
                  {CASE_STATUS_LABELS[g.status]} ({g.count})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left: Cases + Inline Edit */}
          <div className="lg:col-span-2 space-y-4">

            {/* Inline Edit Panel */}
            <div className="rounded-md border border-border bg-card p-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" />Projektdetails
                {canEdit && <span className="text-[10px] normal-case tracking-normal text-muted-foreground/60 ml-1">— Felder anklicken zum Bearbeiten</span>}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <EditableField
                  label="Projektname"
                  value={project.name}
                  disabled={!canEdit}
                  onSave={v => saveField('name', v, 'Projektname')}
                />
                <EditableField
                  label="Status"
                  value={PROJECT_STATUS_LABELS[project.status] ?? project.status}
                  disabled={!canEdit}
                  options={[
                    { value: 'active', label: 'Aktiv' },
                    { value: 'completed', label: 'Abgeschlossen' },
                    { value: 'archived', label: 'Archiviert' },
                  ]}
                  onSave={v => saveField('status', v, 'Status')}
                />
                <EditableField
                  label="Sichtbarkeit"
                  value={VISIBILITY_LABELS[project.visibility] ?? project.visibility}
                  disabled={!canEdit}
                  options={[
                    { value: 'project_members', label: 'Nur Projektmitglieder' },
                    { value: 'department', label: 'Abteilung' },
                    { value: 'private', label: 'Privat' },
                  ]}
                  onSave={v => saveField('visibility', v, 'Sichtbarkeit')}
                />
                <div className="sm:col-span-2">
                  <EditableField
                    label="Beschreibung"
                    value={project.description ?? ''}
                    disabled={!canEdit}
                    multiline
                    onSave={v => saveField('description', v, 'Beschreibung')}
                  />
                </div>
              </div>
            </div>

            {/* Cases Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verknüpfte Vorgänge ({cases.length})</h3>
                <button onClick={() => setCreateOpen(true)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" />Vorgang hinzufügen
                </button>
              </div>
              {cases.length > 0 && (() => {
                const assignees = Array.from(new Map(
                  cases.filter(c => c.assignee_id && c.assignee).map(c => [c.assignee_id!, c.assignee!])
                ).entries());
                const statuses = Array.from(new Set(cases.map(c => c.status)));
                return (
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input
                      value={caseSearch}
                      onChange={e => setCaseSearch(e.target.value)}
                      placeholder="Suche Nr. / Name"
                      className="h-7 text-xs max-w-[180px]"
                    />
                    <Select value={caseStatusFilter} onValueChange={setCaseStatusFilter}>
                      <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Status</SelectItem>
                        {statuses.map(s => <SelectItem key={s} value={s}>{CASE_STATUS_LABELS[s] ?? s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={caseAssigneeFilter} onValueChange={setCaseAssigneeFilter}>
                      <SelectTrigger className="w-[140px] h-7 text-xs"><SelectValue placeholder="Bearbeiter" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Bearbeiter</SelectItem>
                        <SelectItem value="_none">Nicht zugewiesen</SelectItem>
                        {assignees.map(([id, a]) => <SelectItem key={id} value={id}>{a.short_code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              <div className="rounded-md border border-border bg-card overflow-hidden">
                {cases.length === 0 ? (
                  <div className="py-10 text-center">
                    <XCircle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">Keine Vorgänge verknüpft</p>
                    <button onClick={() => setCreateOpen(true)} className="text-[11px] text-primary hover:underline mt-1 inline-block">Vorgang anlegen</button>
                  </div>
                ) : (() => {
                  const filteredCases = cases.filter(c => {
                    if (caseStatusFilter !== 'all' && c.status !== caseStatusFilter) return false;
                    if (caseAssigneeFilter === '_none' && c.assignee_id) return false;
                    if (caseAssigneeFilter !== 'all' && caseAssigneeFilter !== '_none' && c.assignee_id !== caseAssigneeFilter) return false;
                    if (caseSearch) {
                      const s = caseSearch.toLowerCase();
                      if (![c.case_no, c.project_name].some(v => v?.toLowerCase().includes(s))) return false;
                    }
                    return true;
                  });
                  const sortedCases = caseSort.column && caseSort.direction
                    ? sortBy(filteredCases, (c) => {
                        switch (caseSort.column) {
                          case 'status': return c.status;
                          case 'case_no': return c.case_no;
                          case 'project_name': return c.project_name;
                          case 'assignee': return c.assignee?.short_code ?? null;
                          case 'due_at': return c.due_at ? new Date(c.due_at).getTime() : null;
                          default: return null;
                        }
                      }, caseSort.direction)
                    : filteredCases;
                  return (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <SortableHeader column="status" sort={caseSort} onSort={handleCaseSort} className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Status</SortableHeader>
                          <SortableHeader column="case_no" sort={caseSort} onSort={handleCaseSort} className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Nr.</SortableHeader>
                          <SortableHeader column="project_name" sort={caseSort} onSort={handleCaseSort} className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Name</SortableHeader>
                          <SortableHeader column="assignee" sort={caseSort} onSort={handleCaseSort} className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Bearbeiter</SortableHeader>
                          <SortableHeader column="due_at" sort={caseSort} onSort={handleCaseSort} className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Termin</SortableHeader>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedCases.length === 0 ? (
                          <tr><td colSpan={5} className={cn(cellCls, 'py-6 text-center text-muted-foreground')}>Keine Treffer</td></tr>
                        ) : sortedCases.map(c => (
                          <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                            <td className={cellCls}><StatusBadge status={c.status as any} /></td>
                            <td className={cn(cellCls, 'font-mono')}>
                              <Link to={`/cases/${c.id}`} className="text-primary hover:underline">{c.case_no}</Link>
                            </td>
                            <td className={cn(cellCls, 'text-foreground')}>
                              <Link to={`/cases/${c.id}`} className="hover:text-primary transition-colors truncate max-w-[200px] block">{c.project_name}</Link>
                            </td>
                            <td className={cn(cellCls, 'text-muted-foreground')}>{c.assignee?.short_code ?? '–'}</td>
                            <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>{formatDate(c.due_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right: Team + Visibility */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />Team ({members.length})
              </h3>
              <Link to={`/projects/${id}/files`} className="text-[11px] text-primary hover:underline">Verwalten →</Link>
            </div>
            <div className="rounded-md border border-border bg-card overflow-hidden">
              {members.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Keine Mitglieder</div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-medium text-primary">
                          {m.profile?.short_code?.slice(0, 2).toUpperCase() ?? '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{m.profile?.display_name ?? m.user_id}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {m.role === 'manager' && <Crown className="h-3 w-3 text-warning" />}
                          <span className="text-[11px] text-muted-foreground">{m.role === 'manager' ? 'Projektleiter' : 'Mitglied'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-1">Sichtbarkeit</p>
              <p className="text-xs text-foreground font-medium">
                {VISIBILITY_LABELS[project.visibility] ?? project.visibility}
                {project.visibility === 'department' && dept ? ` (${dept.name})` : ''}
              </p>
            </div>

            {/* Activity Timeline */}
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktivitäten</h3>
              </div>
              <ProjectActivityTimeline projectId={project.id} refreshKey={activityRefreshKey} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
