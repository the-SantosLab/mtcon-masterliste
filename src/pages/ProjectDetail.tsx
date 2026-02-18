import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/case-utils';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, ChevronRight, FolderOpen, Users, Crown,
  CheckCircle2, Clock, AlertTriangle, XCircle, Archive,
  TrendingUp, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Project {
  id: string;
  project_number: string;
  project_code: string | null;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  created_at: string;
  department_id: string | null;
  owner_id: string | null;
  created_by: string;
}

interface CaseRow {
  id: string;
  case_no: string;
  project_name: string;
  status: string;
  assignee_id: string | null;
  due_at: string | null;
  assignee: { display_name: string; short_code: string } | null;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  profile: { display_name: string; short_code: string } | null;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

const STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen',
  in_planung: 'In Planung',
  in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug',
  abgeschlossen: 'Abgeschlossen',
  verworfen: 'Verworfen',
  archiv: 'Archiv',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'text-[hsl(var(--status-working))]',
  completed: 'text-[hsl(var(--status-done))]',
  archived: 'text-muted-foreground',
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
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

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('cases')
        .select('id, case_no, project_name, status, assignee_id, due_at, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
        .eq('project_id', id)
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
          ...m,
          profile: profiles.find(p => p.id === m.user_id) ?? null,
        }))
      );
      setDepartments((deptRes.data || []) as Department[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <AppLayout><div className="text-xs text-muted-foreground p-8">Laden…</div></AppLayout>;
  if (!project) return <AppLayout><div className="text-xs text-destructive p-8">Projekt nicht gefunden</div></AppLayout>;

  const dept = departments.find(d => d.id === project.department_id);

  // Stats
  const total = cases.length;
  const done = cases.filter(c => c.status === 'abgeschlossen').length;
  const open = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).length;
  const overdue = cases.filter(c => c.status === 'in_verzug').length;
  const discarded = cases.filter(c => ['verworfen', 'archiv'].includes(c.status)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // Status breakdown for bar
  const statusGroups: { status: string; count: number; color: string }[] = [
    { status: 'in_arbeit', count: cases.filter(c => c.status === 'in_arbeit').length, color: 'bg-[hsl(var(--status-working))]' },
    { status: 'in_planung', count: cases.filter(c => c.status === 'in_planung').length, color: 'bg-[hsl(var(--status-planning))]' },
    { status: 'nicht_begonnen', count: cases.filter(c => c.status === 'nicht_begonnen').length, color: 'bg-muted-foreground/30' },
    { status: 'in_verzug', count: cases.filter(c => c.status === 'in_verzug').length, color: 'bg-[hsl(var(--status-overdue))]' },
    { status: 'abgeschlossen', count: done, color: 'bg-[hsl(var(--status-done))]' },
    { status: 'verworfen', count: discarded, color: 'bg-muted-foreground/20' },
  ].filter(g => g.count > 0);

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
          <span className="text-foreground">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-semibold text-foreground">{project.name}</h1>
              <span className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border',
                project.status === 'active' ? 'border-[hsl(var(--status-working))] text-[hsl(var(--status-working))] bg-[hsl(var(--status-working))]/10' :
                project.status === 'completed' ? 'border-[hsl(var(--status-done))] text-[hsl(var(--status-done))] bg-[hsl(var(--status-done))]/10' :
                'border-border text-muted-foreground'
              )}>
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{project.project_number}</span>
              {project.project_code && <span className="font-mono text-muted-foreground/60">{project.project_code}</span>}
              {dept && <><ChevronRight className="h-3 w-3" /><span>{dept.name}</span></>}
              <ChevronRight className="h-3 w-3" />
              <span>Erstellt {format(new Date(project.created_at), 'dd.MM.yyyy')}</span>
            </div>
            {project.description && (
              <p className="mt-2 text-xs text-muted-foreground max-w-lg">{project.description}</p>
            )}
          </div>
          <Link to={`/projects/${project.id}/files`}>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />Dateiablage
            </Button>
          </Link>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
            label="Vorgänge gesamt" value={total}
            accent="bg-muted"
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-[hsl(var(--status-working))]" />}
            label="Offen" value={open}
            accent="bg-[hsl(var(--status-working))]/10"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--status-overdue))]" />}
            label="In Verzug" value={overdue}
            accent="bg-[hsl(var(--status-overdue))]/10"
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-done))]" />}
            label="Abgeschlossen" value={done}
            sub={total > 0 ? `${progress}% Fortschritt` : undefined}
            accent="bg-[hsl(var(--status-done))]/10"
          />
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="rounded-md border border-border bg-card px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                Fortschritt
              </p>
              <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
            </div>
            {/* Segmented progress bar */}
            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-muted">
              {statusGroups.map(g => (
                <div
                  key={g.status}
                  className={cn('h-full transition-all', g.color)}
                  style={{ width: `${(g.count / total) * 100}%` }}
                  title={`${STATUS_LABELS[g.status]}: ${g.count}`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {statusGroups.map(g => (
                <span key={g.status} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-full', g.color)} />
                  {STATUS_LABELS[g.status]} ({g.count})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Cases Table */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Verknüpfte Vorgänge ({cases.length})
              </h3>
              <Link to={`/cases?project=${id}`} className="text-[11px] text-primary hover:underline">
                Alle anzeigen →
              </Link>
            </div>
            <div className="rounded-md border border-border bg-card overflow-hidden">
              {cases.length === 0 ? (
                <div className="py-10 text-center">
                  <XCircle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Keine Vorgänge verknüpft</p>
                  <Link to="/cases" className="text-[11px] text-primary hover:underline mt-1 inline-block">
                    Vorgang anlegen
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Status</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Nr.</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Name</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Bearbeiter</th>
                      <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Termin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cases.map(c => (
                      <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                        <td className={cellCls}><StatusBadge status={c.status as any} /></td>
                        <td className={cn(cellCls, 'font-mono')}>
                          <Link to={`/cases/${c.id}`} className="text-primary hover:underline">{c.case_no}</Link>
                        </td>
                        <td className={cn(cellCls, 'text-foreground')}>
                          <Link to={`/cases/${c.id}`} className="hover:text-primary transition-colors truncate max-w-[200px] block">
                            {c.project_name}
                          </Link>
                        </td>
                        <td className={cn(cellCls, 'text-muted-foreground')}>{c.assignee?.short_code ?? '–'}</td>
                        <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>{formatDate(c.due_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Team Members */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />Team ({members.length})
              </h3>
              <Link to={`/projects/${id}/files`} className="text-[11px] text-primary hover:underline">
                Verwalten →
              </Link>
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
                        <p className="text-xs font-medium text-foreground truncate">
                          {m.profile?.display_name ?? m.user_id}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {m.role === 'manager' && <Crown className="h-3 w-3 text-amber-500" />}
                          <span className="text-[11px] text-muted-foreground">
                            {m.role === 'manager' ? 'Projektleiter' : 'Mitglied'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visibility */}
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-1">Sichtbarkeit</p>
              <p className="text-xs text-foreground font-medium">
                {project.visibility === 'project_members' ? 'Nur Projektmitglieder' :
                 project.visibility === 'department' ? `Abteilung${dept ? ` (${dept.name})` : ''}` : 'Privat'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
