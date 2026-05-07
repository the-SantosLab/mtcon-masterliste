import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buildTree, STATUS_LABELS, STATUS_DOT_COLORS } from '@/lib/case-utils';
import type { Department, DepartmentNode } from '@/lib/case-utils';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, FolderKanban, Users, Calendar, User as UserIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import type { Enums } from '@/integrations/supabase/types';

type ViewMode = 'projects' | 'cases';

interface ProjectRow {
  id: string;
  name: string;
  project_number: string | null;
  status: string;
  department_id: string | null;
  description: string | null;
  updated_at: string;
  created_at: string;
}

interface ProjectCard extends ProjectRow {
  case_count: number;
  member_count: number;
}

interface CaseCard {
  id: string;
  case_no: string;
  project_name: string;
  status: string;
  department_id: string | null;
  due_at: string | null;
  assignee_short_code?: string;
  created_at: string;
  subtasks_done: number;
  subtasks_total: number;
}

const PROJECT_STATUSES: { id: string; label: string; color: string }[] = [
  { id: 'active', label: 'Aktiv', color: 'bg-[hsl(var(--status-working))]' },
  { id: 'on_hold', label: 'Pausiert', color: 'bg-[hsl(var(--status-planning))]' },
  { id: 'completed', label: 'Abgeschlossen', color: 'bg-[hsl(var(--status-done))]' },
  { id: 'archived', label: 'Archiviert', color: 'bg-[hsl(var(--status-archive))]' },
];

const CASE_STATUSES: { id: string; label: string; color: string }[] = [
  { id: 'nicht_begonnen', label: STATUS_LABELS.nicht_begonnen, color: STATUS_DOT_COLORS.nicht_begonnen },
  { id: 'in_planung', label: STATUS_LABELS.in_planung, color: STATUS_DOT_COLORS.in_planung },
  { id: 'in_arbeit', label: STATUS_LABELS.in_arbeit, color: STATUS_DOT_COLORS.in_arbeit },
  { id: 'ready_for_review', label: STATUS_LABELS.ready_for_review, color: STATUS_DOT_COLORS.ready_for_review },
  { id: 'in_verzug', label: STATUS_LABELS.in_verzug, color: STATUS_DOT_COLORS.in_verzug },
  { id: 'blocked', label: STATUS_LABELS.blocked, color: STATUS_DOT_COLORS.blocked },
  { id: 'abgeschlossen', label: STATUS_LABELS.abgeschlossen, color: STATUS_DOT_COLORS.abgeschlossen },
  { id: 'archiv', label: STATUS_LABELS.archiv, color: STATUS_DOT_COLORS.archiv },
];

function ProjectKanbanCard({ project, onOpen, isDragging }: { project: ProjectCard; onOpen?: () => void; isDragging?: boolean }) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        'group rounded-md border border-border bg-card p-2.5 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">{project.project_number || '—'}</span>
      </div>
      <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug mb-2">{project.name}</p>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><FolderKanban className="h-2.5 w-2.5" />{project.case_count}</span>
        <span className="inline-flex items-center gap-1"><Users className="h-2.5 w-2.5" />{project.member_count}</span>
      </div>
    </div>
  );
}

function CaseKanbanCardInner({ c, onOpen, isDragging, departmentName }: { c: CaseCard; onOpen?: () => void; isDragging?: boolean; departmentName?: string }) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        'rounded-md border border-border bg-card p-2.5 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground">{c.case_no}</span>
          {departmentName && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border truncate max-w-[140px] w-fit">
              {departmentName}
            </span>
          )}
        </div>
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-1', STATUS_DOT_COLORS[c.status as Enums<'case_status'>] || 'bg-muted-foreground')}
        />
      </div>
      <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug mb-2">{c.project_name}</p>
      {c.subtasks_total > 0 && (
        <div className="flex items-center gap-0.5 mb-2">
          {Array.from({ length: Math.min(c.subtasks_total, 10) }).map((_, i) => {
            const isDone = i < c.subtasks_done;
            return (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 max-w-[10px] rounded-sm',
                  isDone ? 'bg-[hsl(var(--status-done))]' : 'bg-destructive/70',
                )}
              />
            );
          })}
          {c.subtasks_total > 10 && (
            <span className="text-[9px] font-mono text-muted-foreground ml-1">+{c.subtasks_total - 10}</span>
          )}
          <span className="text-[9px] font-mono text-muted-foreground ml-auto">
            {c.subtasks_done}/{c.subtasks_total}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {c.due_at && (
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(c.due_at), 'dd.MM.')}
          </span>
        )}
        {c.assignee_short_code && (
          <span className="inline-flex items-center gap-0.5 ml-auto">
            <UserIcon className="h-2.5 w-2.5" />
            {c.assignee_short_code}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableProject({ card, onOpen }: { card: ProjectCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card, kind: 'project' } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <ProjectKanbanCard project={card} onOpen={onOpen} isDragging={isDragging} />
    </div>
  );
}

function DraggableCase({ card, onOpen, departmentName }: { card: CaseCard; onOpen: () => void; departmentName?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card, kind: 'case' } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <CaseKanbanCardInner c={card} onOpen={onOpen} isDragging={isDragging} departmentName={departmentName} />
    </div>
  );
}

function DroppableColumn({ id, label, color, count, collapsed, onToggle, children }: { id: string; label: string; color: string; count: number; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border border-border bg-muted/30 flex flex-col transition-all',
        collapsed ? 'w-10 min-w-[40px] max-w-[40px]' : 'flex-1 min-w-[240px] max-w-[340px]',
        isOver && 'ring-2 ring-primary/30 bg-primary/5',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 border-b border-border hover:bg-muted/50 transition-colors w-full',
          collapsed ? 'flex-col py-2 px-1 h-full border-b-0' : 'px-3 py-2.5',
        )}
      >
        {collapsed ? (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className={cn('h-2 w-2 rounded-full', color)} />
            <span className="text-[10px] font-mono text-muted-foreground" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {label} · {count}
            </span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
            <span className={cn('h-2 w-2 rounded-full', color)} />
            <span className="text-xs font-medium text-foreground">{label}</span>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">{count}</span>
          </>
        )}
      </button>
      {!collapsed && (
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
          {count === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-8">Keine Einträge</p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export default function CasesKanban() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('kanban-view-mode') as ViewMode) || 'projects';
  });
  const STORAGE_KEY = 'kanban-collapsed-cols';
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: ALL columns collapsed
    const all: Record<string, boolean> = {};
    [...PROJECT_STATUSES, ...CASE_STATUSES].forEach(s => { all[s.id] = true; });
    return all;
  });
  const toggleCol = (id: string) => setCollapsedCols(prev => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [cases, setCases] = useState<CaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<ProjectCard | null>(null);
  const [activeCase, setActiveCase] = useState<CaseCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    localStorage.setItem('kanban-view-mode', viewMode);
  }, [viewMode]);

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase.from('departments').select('*').order('sort_order');
    const depts = (data || []) as Department[];
    setDepartments(depts);
    setTree(buildTree(depts));
  }, []);

  const fetchProjects = useCallback(async () => {
    const { data: projData } = await supabase
      .from('projects')
      .select('id, name, project_number, status, department_id, description, updated_at, created_at')
      .order('created_at', { ascending: true });
    const list = (projData || []) as ProjectRow[];

    const ids = list.map(p => p.id);
    let caseCounts: Record<string, number> = {};
    let memberCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: cs } = await supabase.from('cases').select('project_id').in('project_id', ids);
      (cs || []).forEach((c: any) => { if (c.project_id) caseCounts[c.project_id] = (caseCounts[c.project_id] || 0) + 1; });
      const { data: ms } = await supabase.from('project_members').select('project_id').in('project_id', ids);
      (ms || []).forEach((m: any) => { memberCounts[m.project_id] = (memberCounts[m.project_id] || 0) + 1; });
    }

    setProjects(list.map(p => ({ ...p, case_count: caseCounts[p.id] || 0, member_count: memberCounts[p.id] || 0 })));
  }, []);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select('id, case_no, project_name, status, department_id, due_at, assignee_id, created_at')
      .order('created_at', { ascending: true });
    const list = (data || []) as any[];

    const assigneeIds: string[] = Array.from(new Set(list.map(c => c.assignee_id).filter(Boolean) as string[]));
    const shortCodes: Record<string, string> = {};
    if (assigneeIds.length > 0) {
      const profsRes: any = await (supabase as any).from('profiles')
        .select('user_id, short_code')
        .in('user_id', assigneeIds);
      const profs = (profsRes?.data || []) as any[];
      profs.forEach((p: any) => { shortCodes[p.user_id] = p.short_code; });
    }

    const caseIds = list.map(c => c.id);
    const subDone: Record<string, number> = {};
    const subTotal: Record<string, number> = {};
    if (caseIds.length > 0) {
      const { data: subs } = await supabase
        .from('case_tasks')
        .select('case_id, status')
        .in('case_id', caseIds);
      (subs || []).forEach((t: any) => {
        subTotal[t.case_id] = (subTotal[t.case_id] || 0) + 1;
        if (t.status === 'done') subDone[t.case_id] = (subDone[t.case_id] || 0) + 1;
      });
    }

    setCases(list.map(c => ({
      id: c.id,
      case_no: c.case_no,
      project_name: c.project_name,
      status: c.status,
      department_id: c.department_id,
      due_at: c.due_at,
      assignee_short_code: c.assignee_id ? shortCodes[c.assignee_id] : undefined,
      created_at: c.created_at,
      subtasks_done: subDone[c.id] || 0,
      subtasks_total: subTotal[c.id] || 0,
    })));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDepartments();
    Promise.all([fetchProjects(), fetchCases()]).finally(() => setLoading(false));
    const ch = supabase
      .channel('kanban-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, () => fetchCases())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Scope by selected department (incl. children)
  const scopeByDept = <T extends { department_id: string | null }>(arr: T[]) =>
    selectedDeptId
      ? arr.filter(x => {
          const childIds = departments.filter(d => d.parent_id === selectedDeptId).map(d => d.id);
          return x.department_id === selectedDeptId || childIds.includes(x.department_id || '');
        })
      : arr;

  const q = searchQuery.toLowerCase();

  const projectColumns = PROJECT_STATUSES.map(s => {
    const filtered = scopeByDept(projects)
      .filter(p => !searchQuery || p.name.toLowerCase().includes(q) || (p.project_number || '').toLowerCase().includes(q))
      .filter(p => p.status === s.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { ...s, cards: filtered };
  });

  const caseColumns = CASE_STATUSES.map(s => {
    const filtered = scopeByDept(cases)
      .filter(c => !searchQuery || c.project_name.toLowerCase().includes(q) || c.case_no.toLowerCase().includes(q))
      .filter(c => c.status === s.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { ...s, cards: filtered };
  });

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as any;
    if (data?.kind === 'project') setActiveProject(data.card);
    else if (data?.kind === 'case') setActiveCase(data.card);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const data = e.active.data.current as any;
    setActiveProject(null);
    setActiveCase(null);
    const { over } = e;
    if (!over) return;
    const targetStatus = over.id as string;

    if (data?.kind === 'project') {
      const card = data.card as ProjectCard;
      if (card.status === targetStatus) return;
      const { error } = await supabase
        .from('projects')
        .update({ status: targetStatus, updated_at: new Date().toISOString() })
        .eq('id', card.id);
      if (error) { toast.error(error.message); return; }
      if (user?.id) {
        await supabase.from('project_activity').insert({
          project_id: card.id,
          action: 'STATUS_CHANGE',
          actor_id: user.id,
          field: 'status',
          old_value: card.status,
          new_value: targetStatus,
        });
      }
      const lbl = PROJECT_STATUSES.find(s => s.id === targetStatus)?.label || targetStatus;
      toast.success(`Status auf "${lbl}" geändert`);
      fetchProjects();
    } else if (data?.kind === 'case') {
      const card = data.card as CaseCard;
      if (card.status === targetStatus) return;
      const { error } = await supabase
        .from('cases')
        .update({ status: targetStatus as Enums<'case_status'>, updated_at: new Date().toISOString() })
        .eq('id', card.id);
      if (error) { toast.error(error.message); return; }
      const lbl = CASE_STATUSES.find(s => s.id === targetStatus)?.label || targetStatus;
      toast.success(`Status auf "${lbl}" geändert`);
      fetchCases();
    }
  };

  const selectedDept = departments.find(d => d.id === selectedDeptId);
  const isProjects = viewMode === 'projects';

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-0 -m-5 lg:-m-8">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-border bg-card/50 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs font-semibold text-foreground">Abteilungen</span>
            {selectedDeptId && (
              <button
                onClick={() => setSelectedDeptId(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Alle
              </button>
            )}
          </div>
          <DepartmentTreeView
            nodes={tree}
            selectedId={selectedDeptId}
            onSelect={setSelectedDeptId}
            compact
            defaultCollapsed
          />
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {selectedDept?.name || (isProjects ? 'Alle Projekte' : 'Alle Vorgänge')}
            </h2>

            <ToggleGroup
              type="single"
              size="sm"
              value={viewMode}
              onValueChange={(v) => { if (v) setViewMode(v as ViewMode); }}
              className="ml-2"
            >
              <ToggleGroupItem value="projects" className="h-7 px-2.5 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Übergreifende Vorgänge
              </ToggleGroupItem>
              <ToggleGroupItem value="cases" className="h-7 px-2.5 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Einzelne Vorgänge
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder={isProjects ? 'Projekt suchen…' : 'Vorgang suchen…'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7 w-48"
              />
            </div>
          </div>

          {/* Kanban */}
          <div className="flex-1 overflow-x-auto p-4">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-12">Laden…</p>
            ) : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-3 h-full">
                  {isProjects
                    ? projectColumns.map(col => (
                        <DroppableColumn key={col.id} id={col.id} label={col.label} color={col.color} count={col.cards.length} collapsed={!!collapsedCols[col.id]} onToggle={() => toggleCol(col.id)}>
                          {col.cards.map(c => (
                            <DraggableProject key={c.id} card={c} onOpen={() => navigate(`/projects/${c.id}`)} />
                          ))}
                        </DroppableColumn>
                      ))
                    : caseColumns.map(col => (
                        <DroppableColumn key={col.id} id={col.id} label={col.label} color={col.color} count={col.cards.length} collapsed={!!collapsedCols[col.id]} onToggle={() => toggleCol(col.id)}>
                          {col.cards.map(c => (
                            <DraggableCase key={c.id} card={c} onOpen={() => navigate(`/cases/${c.id}`)} departmentName={!selectedDeptId ? departments.find(d => d.id === c.department_id)?.name : undefined} />
                          ))}
                        </DroppableColumn>
                      ))}
                </div>
                <DragOverlay>
                  {activeProject && <ProjectKanbanCard project={activeProject} isDragging />}
                  {activeCase && <CaseKanbanCardInner c={activeCase} isDragging departmentName={!selectedDeptId ? departments.find(d => d.id === activeCase.department_id)?.name : undefined} />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
