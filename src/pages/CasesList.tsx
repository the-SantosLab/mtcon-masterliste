import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCaseActions } from '@/hooks/useCaseActions';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, canClaim, isTerminalStatus, STATUS_LABELS, STATUS_DOT_COLORS, resolveEffectiveDeptId, caseMatchesDept, getUrgencyDotColor, getUrgencyRowClass } from '@/lib/case-utils';
import { UrgencyDot } from '@/components/UrgencyDot';
import type { Tables } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { Search, Plus, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CreateCaseForm } from '@/components/CreateCaseForm';
import { CompleteCaseDialog } from '@/components/CompleteCaseDialog';
import { SortableHeader, type SortState, nextSort, sortBy } from '@/components/SortableHeader';
import { UrgencyPicker } from '@/components/UrgencyPicker';
import { useChatUnread } from '@/hooks/useChatUnread';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';

type CaseSortKey = 'status' | 'case_no' | 'project_name' | 'project' | 'assignee' | 'department' | 'customer' | 'due_at' | 'urgency';
type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'next14' | 'none';
type DateRangeFilter = 'all' | 'lastMonth' | 'last2Months' | 'last3Months' | 'last6Months';

type CaseRow = Tables<'cases'> & {
  assignee: { display_name: string; short_code: string } | null;
  project: { id: string; project_number: string; name: string } | null;
  department: { name: string } | null;
};

interface DeptFilterOption { id: string; name: string; code: string | null; parent_id: string | null; }

export default function CasesList() {
  const { user, isAdmin, isViewer } = useAuth();
  const { preferences } = usePreferences();
  const compact = preferences.compactTables;
  // Kompakt: einzeilig + ~0.75x Schriftgröße ggü. Normalansicht
  const cellCls = compact
    ? 'px-3 py-1 text-[10px] whitespace-nowrap'
    : 'px-4 py-2.5 text-sm';
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [profiles, setProfiles] = useState<Tables<'users_profile'>[]>([]);
  const [departments, setDepartments] = useState<DeptFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const allStatuses = Constants.public.Enums.case_status;
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('casesFilter_statuses');
      return stored ? JSON.parse(stored) : [...allStatuses];
    } catch { return [...allStatuses]; }
  });
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');
  const [onlyMine, setOnlyMine] = useState<boolean>(() => {
    try { return localStorage.getItem('casesFilter_onlyMine') === 'true'; } catch { return false; }
  });
  const [sort, setSort] = useState<SortState<CaseSortKey>>(() => {
    try {
      const col = localStorage.getItem('casesSort_column') as CaseSortKey | null;
      const dir = localStorage.getItem('casesSort_direction') as 'asc' | 'desc' | null;
      if (col && dir) return { column: col, direction: dir };
    } catch {}
    return { column: 'due_at', direction: 'asc' };
  });
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; project_number: string; name: string }[]>([]);
  const [completeId, setCompleteId] = useState<string | null>(null);

  const fetchCases = async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code), project:projects!cases_project_id_fkey(id, project_number, name), department:departments!cases_department_id_fkey(name)')
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  };

  const [myTaskCaseIds, setMyTaskCaseIds] = useState<Set<string>>(new Set());

  const fetchMyTaskCaseIds = async () => {
    if (!user?.id) { setMyTaskCaseIds(new Set()); return; }
    const { data } = await supabase
      .from('case_tasks')
      .select('case_id')
      .eq('assigned_to', user.id);
    setMyTaskCaseIds(new Set((data || []).map((r: any) => r.case_id)));
  };

  useEffect(() => {
    fetchCases();
    fetchMyTaskCaseIds();
    supabase.from('users_profile').select('*').then(r => setProfiles((r.data || []) as any[]));
    supabase.from('projects').select('id, project_number, name').eq('status', 'active').order('created_at', { ascending: false })
      .then(r => setProjects(r.data || []));
    supabase.from('departments').select('id, name, code, parent_id').eq('is_active', true).order('sort_order')
      .then(r => setDepartments((r.data || []) as DeptFilterOption[]));
    const ch = supabase.channel('list-cases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, () => fetchMyTaskCaseIds())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'mine') setAssigneeFilter(user?.id || 'all');
    if (f === 'available') setAssigneeFilter('unassigned');
  }, [searchParams, user]);

  const { claimCase, unclaimCase, completeCase } = useCaseActions(user?.id, fetchCases);
  const { unreadMap } = useChatUnread(cases.map(c => c.id));

  const toggleOnlyMine = () => {
    setOnlyMine(v => {
      const next = !v;
      try { localStorage.setItem('casesFilter_onlyMine', String(next)); } catch {}
      return next;
    });
  };

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
      try { localStorage.setItem('casesFilter_statuses', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleSort = (col: CaseSortKey) => {
    setSort(prev => {
      const next = nextSort(prev, col);
      try {
        if (next.column && next.direction) {
          localStorage.setItem('casesSort_column', next.column);
          localStorage.setItem('casesSort_direction', next.direction);
        } else {
          localStorage.removeItem('casesSort_column');
          localStorage.removeItem('casesSort_direction');
        }
      } catch {}
      return next;
    });
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter([...allStatuses]);
    setAssigneeFilter('all');
    setProjectFilter('all');
    setDeptFilter('all');
    setDueFilter('all');
    setDateRangeFilter('all');
    setOnlyMine(false);
    try {
      localStorage.removeItem('casesFilter_statuses');
      localStorage.setItem('casesFilter_onlyMine', 'false');
    } catch {}
  };

  const filtersActive =
    !!search ||
    statusFilter.length !== allStatuses.length ||
    assigneeFilter !== 'all' ||
    projectFilter !== 'all' ||
    deptFilter !== 'all' ||
    dueFilter !== 'all' ||
    dateRangeFilter !== 'all' ||
    onlyMine;

  const creatorDeptMap = Object.fromEntries(profiles.map(p => [p.id, p.department_id]));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inDays = (d: Date, n: number) => { const x = new Date(today); x.setDate(x.getDate() + n); return d <= x; };

  const getDateRangeBounds = (filter: DateRangeFilter): { from: Date; to: Date } | null => {
    const now = new Date();
    switch (filter) {
      case 'lastMonth': {
        const m = subMonths(now, 1);
        return { from: startOfMonth(m), to: endOfMonth(m) };
      }
      case 'last2Months': {
        const m = subMonths(now, 2);
        return { from: startOfMonth(m), to: endOfMonth(m) };
      }
      case 'last3Months': {
        return { from: startOfMonth(subMonths(now, 2)), to: now };
      }
      case 'last6Months': {
        return { from: startOfMonth(subMonths(now, 5)), to: now };
      }
      default:
        return null;
    }
  };

  const filtered = cases.filter(c => {
    if (onlyMine && c.assignee_id !== user?.id && !myTaskCaseIds.has(c.id)) return false;
    if (!statusFilter.includes(c.status)) return false;
    if (assigneeFilter === 'unassigned' && c.assignee_id !== null) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && c.assignee_id !== assigneeFilter) return false;
    if (projectFilter !== 'all') {
      if (projectFilter === '_none' && c.project_id !== null) return false;
      if (projectFilter !== '_none' && c.project_id !== projectFilter) return false;
    }
    if (deptFilter !== 'all') {
      const { effectiveId } = resolveEffectiveDeptId(c, creatorDeptMap);
      if (deptFilter === '_none') {
        if (effectiveId !== null) return false;
      } else {
        const childIds = departments.filter(d => d.parent_id === deptFilter).map(d => d.id);
        if (!caseMatchesDept(c, deptFilter, childIds, creatorDeptMap)) return false;
      }
    }
    if (dueFilter !== 'all') {
      if (dueFilter === 'none') {
        if (c.due_at) return false;
      } else {
        if (!c.due_at) return false;
        const d = new Date(c.due_at); d.setHours(0, 0, 0, 0);
        if (dueFilter === 'overdue' && d >= today) return false;
        if (dueFilter === 'today' && d.getTime() !== today.getTime()) return false;
        if (dueFilter === 'week' && (d < today || !inDays(d, 7))) return false;
        if (dueFilter === 'next14' && (d < today || !inDays(d, 14))) return false;
      }
    }
    if (dateRangeFilter !== 'all' && c.created_at) {
      const bounds = getDateRangeBounds(dateRangeFilter);
      if (bounds) {
        const created = new Date(c.created_at);
        if (created < bounds.from || created > bounds.to) return false;
      }
    }
    if (search) {
      const s = search.toLowerCase();
      if (![c.case_no, c.project_name, c.client_name, c.project_article_no, c.project?.project_number, c.project?.name].some(v => v?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const statusOrder = allStatuses as readonly string[];
  const sorted = sort.column && sort.direction ? sortBy(filtered, (c) => {
    switch (sort.column) {
      case 'status': return statusOrder.indexOf(c.status);
      case 'case_no': return c.case_no;
      case 'project_name': return c.project_name;
      case 'project': return c.project?.project_number ?? null;
      case 'assignee': return c.assignee?.short_code ?? null;
      case 'department': {
        if (c.department?.name) return c.department.name;
        const { effectiveId } = resolveEffectiveDeptId(c, creatorDeptMap);
        return effectiveId ? departments.find(d => d.id === effectiveId)?.name ?? null : null;
      }
      case 'customer': return c.customer_no;
      case 'due_at': return c.due_at ? new Date(c.due_at).getTime() : null;
      case 'urgency': return (c as any).urgency ?? 0;
      default: return null;
    }
  }, sort.direction) : filtered;


  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vorgänge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Masterliste aller Vorgänge</p>
          </div>
          {!isViewer && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />Neuer Vorgang
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-2xl max-h-[90vh] overflow-y-auto"
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
              >
                <DialogHeader><DialogTitle className="text-sm font-semibold">Neuen Vorgang anlegen</DialogTitle></DialogHeader>
                <CreateCaseForm userId={user?.id || ''} onCreated={() => { setCreateOpen(false); fetchCases(); }} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche" className="pl-9 h-8 text-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {allStatuses.map(s => {
              const active = statusFilter.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all border',
                    active
                      ? 'bg-muted/50 border-border/80 text-foreground'
                      : 'bg-transparent border-transparent text-muted-foreground/40 hover:text-muted-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', active ? STATUS_DOT_COLORS[s] : 'bg-muted-foreground/20')} />
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Bearbeiter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.short_code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Projekt" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Projekte</SelectItem>
              <SelectItem value="_none">Ohne Projekt</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-[11px] text-muted-foreground mr-1">{p.project_number}</span>{p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Abteilung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Abteilungen</SelectItem>
              <SelectItem value="_none">Ohne Abteilung</SelectItem>
              {departments.filter(d => !d.parent_id).map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code ? <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{d.code}</span> : null}{d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Termin" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Termine</SelectItem>
              <SelectItem value="overdue">Überfällig</SelectItem>
              <SelectItem value="today">Heute fällig</SelectItem>
              <SelectItem value="week">≤ 7 Tage</SelectItem>
              <SelectItem value="next14">≤ 14 Tage</SelectItem>
              <SelectItem value="none">Ohne Termin</SelectItem>
            </SelectContent>
          </Select>

          {/* Zeitraum-Schnellfilter */}
          <div className="flex items-center gap-1">
            {([
              { key: 'lastMonth', label: 'Vormonat' },
              { key: 'last2Months', label: 'Vorvormonat' },
              { key: 'last3Months', label: '3 Monate' },
              { key: 'last6Months', label: '6 Monate' },
            ] as { key: DateRangeFilter; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateRangeFilter(prev => prev === key ? 'all' : key)}
                className={cn(
                  'h-8 px-2.5 rounded-md border text-[11px] font-medium transition-colors shrink-0',
                  dateRangeFilter === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={toggleOnlyMine}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors shrink-0',
              onlyMine
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Nur meine
            {onlyMine && <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] rounded-full px-1 leading-none py-0.5">{filtered.length}</span>}
          </button>
          {filtersActive && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><UrgencyDot status={'in_arbeit' as any} dueAt={null} forceColor="bg-red-500" forceLabel="!" />Überfällig</span>
          <span className="flex items-center gap-1.5"><UrgencyDot status={'in_arbeit' as any} dueAt={null} forceColor="bg-yellow-500" forceLabel="⏱" />Fällig in ≤3 Tagen</span>
          <span className="flex items-center gap-1.5"><UrgencyDot status={'in_arbeit' as any} dueAt={null} forceColor="bg-emerald-500" forceLabel="✓" />In Arbeit (Zukunft)</span>
          <span className="flex items-center gap-1.5"><UrgencyDot status={'nicht_begonnen' as any} dueAt={null} forceColor="bg-blue-500" forceLabel="–" />Nicht begonnen</span>
          <span className="flex items-center gap-1.5"><UrgencyDot status={'in_arbeit' as any} dueAt={null} forceColor="bg-purple-500" forceLabel="?" />Aktiv ohne Endtermin</span>
        </div>

        {/* Table */}
        <div className={cn('rounded-md border border-border bg-card overflow-auto max-h-[calc(100vh-260px)]', compact && 'cases-table-compact')}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader column="status" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Status</SortableHeader>
                <SortableHeader column="case_no" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground min-w-[120px] whitespace-nowrap')}>Nr.</SortableHeader>
                <SortableHeader column="project_name" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Projektname</SortableHeader>
                <SortableHeader column="project" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Projekt</SortableHeader>
                <SortableHeader column="assignee" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Bearbeiter</SortableHeader>
                <SortableHeader column="department" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Abteilung</SortableHeader>
                <SortableHeader column="customer" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Kunde</SortableHeader>
                <SortableHeader column="due_at" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Endtermin</SortableHeader>
                <SortableHeader column="urgency" sort={sort} onSort={handleSort} className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground whitespace-nowrap')}>Dringlichkeit</SortableHeader>
                <th className={cn(cellCls, 'sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground')}>Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={10} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Laden</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={10} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Keine Vorgänge gefunden</td></tr>
              ) : sorted.map(c => (
                <tr key={c.id} className={cn('hover:bg-muted/40 transition-colors', getUrgencyRowClass((c as any).urgency, (c as any).status))}>
                  <td className={cellCls}>
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground whitespace-nowrap">
                      <UrgencyDot status={c.status} dueAt={c.due_at} />
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className={cn(cellCls, 'font-mono min-w-[120px] whitespace-nowrap')}>
                    <Link to={`/cases/${c.id}`} className="text-primary hover:underline inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="whitespace-nowrap">{c.case_no}</span>
                      {(unreadMap[c.id] ?? 0) > 0 && (
                        <span
                          title={`${unreadMap[c.id]} ungelesene Nachricht(en)`}
                          className={cn(
                            'inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold leading-none shrink-0',
                            compact ? 'min-w-[12px] h-[12px] px-0.5 text-[8px]' : 'min-w-[16px] h-[16px] px-1 text-[9px]',
                          )}
                        >{unreadMap[c.id] > 9 ? '9+' : unreadMap[c.id]}</span>
                      )}
                    </Link>
                  </td>
                  <td className={cn(cellCls, 'text-foreground')}>
                    <Link to={`/cases/${c.id}`} className="hover:text-primary transition-colors">{c.project_name}</Link>
                  </td>
                  <td className={cellCls}>
                    {c.project ? (
                      <Link to={`/projects/${c.project.id}`} className="inline-flex items-center gap-1 group" title={c.project.name}>
                        <span className="font-mono text-[11px] text-primary group-hover:underline">{c.project.project_number}</span>
                      </Link>
                    ) : <span className="text-muted-foreground">–</span>}
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>{c.assignee?.short_code || '–'}</td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>
                    {c.department?.name ? (
                      c.department.name
                    ) : (() => {
                      const { effectiveId, isFallback } = resolveEffectiveDeptId(c, creatorDeptMap);
                      if (isFallback && effectiveId) {
                        const name = departments.find(d => d.id === effectiveId)?.name;
                        return <span className="italic opacity-70" title="Zugeordnet über Abteilung des Erstellers">via {name}</span>;
                      }
                      return '–';
                    })()}
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>{c.customer_no || '–'}</td>
                  <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>{formatDate(c.due_at)}</td>
                  <td className={cellCls}>
                    <UrgencyPicker
                      value={(c as any).urgency}
                      table="cases"
                      rowId={c.id}
                      readOnly={isViewer}
                      size="sm"
                      derived
                      overridden={!!(c as any).urgency_override}
                      canOverride={isAdmin}
                    />
                  </td>
                  <td className={cellCls}>
                    <div className="flex gap-1">
                      {!isViewer && canClaim(c.status, c.assignee_id) && (
                        <button onClick={() => claimCase(c.id)} className="text-primary hover:underline text-xs font-medium">Abholen</button>
                      )}
                      {!isViewer && c.assignee_id === user?.id && !isTerminalStatus(c.status) && (
                        <button onClick={() => unclaimCase(c.id)} className="text-muted-foreground hover:text-foreground text-xs">Freigeben</button>
                      )}
                      {!isViewer && (c.assignee_id === user?.id || isAdmin) && !isTerminalStatus(c.status) && (
                        <button onClick={() => setCompleteId(c.id)} className="text-muted-foreground hover:text-foreground text-xs ml-1">Abschließen</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CompleteCaseDialog
          open={!!completeId}
          onOpenChange={(o) => { if (!o) setCompleteId(null); }}
          onConfirm={async (note) => { if (completeId) await completeCase(completeId, note); }}
        />
        <p className="text-[11px] text-muted-foreground">{filtered.length} Vorgang/Vorgänge</p>
      </div>
    </AppLayout>
  );
}
