import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buildTree, STATUS_LABELS, STATUS_DOT_COLORS, getUrgencyDotColor } from '@/lib/case-utils';
import { UrgencyDot } from '@/components/UrgencyDot';
import type { Department, DepartmentNode } from '@/lib/case-utils';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, FolderKanban, Users, Calendar, User as UserIcon, ChevronDown, ChevronRight, Trash2, CheckSquare, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import type { Enums } from '@/integrations/supabase/types';
import { CompleteCaseDialog } from '@/components/CompleteCaseDialog';
import { useCaseActions } from '@/hooks/useCaseActions';

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
  effective_department_id: string | null;
  is_dept_fallback: boolean;
  created_by: string | null;
  due_at: string | null;
  assignee_short_code?: string;
  created_at: string;
  subtasks_done: number;
  subtasks_total: number;
  priority_order: number;
  urgency?: number | null;
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

function CaseKanbanCardInner({ c, onOpen, isDragging, departmentName, selectable, selected, onToggleSelect }: { c: CaseCard; onOpen?: () => void; isDragging?: boolean; departmentName?: string; selectable?: boolean; selected?: boolean; onToggleSelect?: () => void }) {
  return (
    <div
      onClick={(e) => {
        if (selectable) { e.stopPropagation(); onToggleSelect?.(); return; }
        onOpen?.();
      }}
      className={cn(
        'rounded-md border bg-card p-2.5 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-colors',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {selectable && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={() => onToggleSelect?.()}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 h-3.5 w-3.5"
            />
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground">{c.case_no}</span>
            {departmentName && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border truncate max-w-[140px] w-fit">
                {departmentName}
              </span>
            )}
          </div>
        </div>
        <UrgencyDot
          status={c.status as Enums<'case_status'>}
          dueAt={c.due_at}
          className="mt-0.5"
        />
        <span className="sr-only">{STATUS_LABELS[c.status as Enums<'case_status'>] || c.status}</span>
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

function DraggableCase({ card, onOpen, departmentName, selectable, selected, onToggleSelect, bulkIds }: { card: CaseCard; onOpen: () => void; departmentName?: string; selectable?: boolean; selected?: boolean; onToggleSelect?: () => void; bulkIds?: string[] }) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: card.id,
    data: { card, kind: 'case', status: card.status, bulkIds: selected && bulkIds && bulkIds.length > 1 ? bulkIds : undefined },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 150ms ease',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group relative">
      <button
        type="button"
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity cursor-grab active:cursor-grabbing z-10"
        aria-label="Verschieben"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      <div className={cn(isDragging && 'opacity-40')}>
        <CaseKanbanCardInner c={card} onOpen={onOpen} isDragging={isDragging} departmentName={departmentName} selectable={selectable} selected={selected} onToggleSelect={onToggleSelect} />
      </div>
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
  const { user, isAdmin } = useAuth();
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const toggleCaseSelected = (id: string) => setSelectedCaseIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exitSelectMode = () => { setSelectMode(false); setSelectedCaseIds(new Set()); };

  const bulkDeleteCases = async () => {
    const ids = Array.from(selectedCaseIds);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('cases')
      .update({ deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as any)
      .in('id', ids)
      .eq('deleted', false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success(`${ids.length} Vorgänge in den Papierkorb verschoben`);
    setConfirmBulkDelete(false);
    exitSelectMode();
    fetchCases();
  };
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [cases, setCases] = useState<CaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<ProjectCard | null>(null);
  const [activeCase, setActiveCase] = useState<CaseCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCloseIds, setPendingCloseIds] = useState<string[] | null>(null);
  const { completeCase } = useCaseActions(user?.id, () => fetchCases());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    localStorage.setItem('kanban-view-mode', viewMode);
  }, [viewMode]);

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase.from('departments').select('*').order('sort_order');
    const depts = (data || []) as Department[];

    let visible = depts;
    if (user?.id) {
      const [{ data: roles }, { data: perms }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        (supabase as any).from('department_members')
          .select('department_id, role')
          .eq('user_id', user.id)
          .in('role', ['read', 'write', 'lead']),
      ]);
      const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
      if (!isAdmin) {
        const allowed = new Set<string>();
        (perms || []).forEach((p: any) => allowed.add(p.department_id));
        depts.forEach((d: any) => { if (d.owner_id === user.id) allowed.add(d.id); });
        // Include ancestors so the tree stays connected
        const byId = new Map(depts.map(d => [d.id, d]));
        const withAncestors = new Set(allowed);
        allowed.forEach(id => {
          let cur = byId.get(id);
          while (cur?.parent_id) {
            withAncestors.add(cur.parent_id);
            cur = byId.get(cur.parent_id);
          }
        });
        visible = depts.filter(d => withAncestors.has(d.id));
      }
    }

    setDepartments(visible);
    setTree(buildTree(visible));
  }, [user?.id]);

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
      const { data: cs } = await supabase.from('cases').select('project_id').in('project_id', ids).eq('deleted', false);
      (cs || []).forEach((c: any) => { if (c.project_id) caseCounts[c.project_id] = (caseCounts[c.project_id] || 0) + 1; });
      const { data: ms } = await supabase.from('project_members').select('project_id').in('project_id', ids);
      (ms || []).forEach((m: any) => { memberCounts[m.project_id] = (memberCounts[m.project_id] || 0) + 1; });
    }

    setProjects(list.map(p => ({ ...p, case_count: caseCounts[p.id] || 0, member_count: memberCounts[p.id] || 0 })));
  }, []);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select('id, case_no, project_name, status, department_id, due_at, assignee_id, created_by, created_at, priority_order, urgency')
      .eq('deleted', false)
      .order('priority_order', { ascending: true })
      .order('created_at', { ascending: true });
    const list = (data || []) as any[];

    const userIds: string[] = Array.from(new Set([
      ...list.map(c => c.assignee_id).filter(Boolean),
      ...list.map(c => c.created_by).filter(Boolean),
    ] as string[]));
    const shortCodes: Record<string, string> = {};
    const creatorDept: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('users_profile')
        .select('id, short_code, department_id')
        .in('id', userIds);
      (profs || []).forEach((p: any) => {
        shortCodes[p.id] = p.short_code;
        creatorDept[p.id] = p.department_id;
      });
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

    setCases(list.map(c => {
      const fallback = !c.department_id && c.created_by ? creatorDept[c.created_by] ?? null : null;
      return {
        id: c.id,
        case_no: c.case_no,
        project_name: c.project_name,
        status: c.status,
        department_id: c.department_id,
        effective_department_id: c.department_id ?? fallback,
        is_dept_fallback: !c.department_id && !!fallback,
        created_by: c.created_by ?? null,
        due_at: c.due_at,
        assignee_short_code: c.assignee_id ? shortCodes[c.assignee_id] : undefined,
        created_at: c.created_at,
        subtasks_done: subDone[c.id] || 0,
        subtasks_total: subTotal[c.id] || 0,
        priority_order: c.priority_order ?? 0,
        urgency: c.urgency ?? 0,
      };
    }));
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

  // Scope by selected department (incl. children).
  // For cases we use effective_department_id to honor the silent fallback to creator's dept.
  const scopeByDept = <T extends { department_id: string | null; effective_department_id?: string | null }>(arr: T[]) =>
    selectedDeptId
      ? arr.filter(x => {
          const childIds = departments.filter(d => d.parent_id === selectedDeptId).map(d => d.id);
          const id = x.effective_department_id !== undefined ? x.effective_department_id : x.department_id;
          return id === selectedDeptId || childIds.includes(id || '');
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
      .sort((a, b) => (a.priority_order - b.priority_order) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
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
    const { over, active } = e;
    if (!over) return;

    if (data?.kind === 'project') {
      const targetStatus = over.id as string;
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
      return;
    }

    if (data?.kind === 'case') {
      const card = data.card as CaseCard;
      const overData = over.data.current as any;
      // Determine target status: either column id (over.id) or sibling card's status
      const overIsColumn = CASE_STATUSES.some(s => s.id === over.id);
      const targetStatus = overIsColumn ? (over.id as string) : (overData?.status as string) || card.status;

      // Same column => reorder
      if (targetStatus === card.status && !overIsColumn && over.id !== active.id) {
        const colCards = caseColumns.find(c => c.id === card.status)?.cards || [];
        const oldIndex = colCards.findIndex(c => c.id === active.id);
        const newIndex = colCards.findIndex(c => c.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(colCards, oldIndex, newIndex);
        // Optimistic update
        setCases(prev => {
          const map = new Map(reordered.map((c, i) => [c.id, i]));
          return prev.map(c => map.has(c.id) ? { ...c, priority_order: map.get(c.id)! } : c);
        });
        // Persist
        const updates = reordered.map((c, i) =>
          supabase.from('cases').update({ priority_order: i }).eq('id', c.id),
        );
        const results = await Promise.all(updates);
        const failed = results.find(r => r.error);
        if (failed?.error) { toast.error(failed.error.message); fetchCases(); }
        return;
      }

      // Status change (column move)
      if (targetStatus !== card.status) {
        const bulkIds: string[] | undefined = data.bulkIds;
        const ids = bulkIds && bulkIds.length > 1 ? bulkIds : [card.id];

        // Unify: closing always goes through CompleteCaseDialog (mandatory note + email + activity)
        if (targetStatus === 'abgeschlossen') {
          setPendingCloseIds(ids);
          return;
        }

        const targetCol = caseColumns.find(c => c.id === targetStatus);
        const baseOrder = (targetCol?.cards.length ?? 0);
        const { error } = await supabase
          .from('cases')
          .update({
            status: targetStatus as Enums<'case_status'>,
            priority_order: baseOrder,
            last_changed_at: new Date().toISOString(),
            last_changed_by: user?.id ?? null,
          })
          .in('id', ids);
        if (error) { toast.error(error.message); return; }
        const lbl = CASE_STATUSES.find(s => s.id === targetStatus)?.label || targetStatus;
        toast.success(ids.length > 1 ? `${ids.length} Vorgänge auf "${lbl}" verschoben` : `Status auf "${lbl}" geändert`);
        if (ids.length > 1) exitSelectMode();
        fetchCases();
      }
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
              <ToggleGroupItem value="projects" className="h-7 px-3 text-[11px] rounded-full transition-all duration-150 ease-out text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-md data-[state=on]:font-semibold">
                Übergreifende Vorgänge
              </ToggleGroupItem>
              <ToggleGroupItem value="cases" className="h-7 px-3 text-[11px] rounded-full transition-all duration-150 ease-out text-muted-foreground hover:text-foreground hover:bg-muted/50 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-md data-[state=on]:font-semibold">
                Einzelne Vorgänge
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex-1" />

            {isAdmin && !isProjects && (
              selectMode ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{selectedCaseIds.size} ausgewählt</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    disabled={selectedCaseIds.size === 0}
                    onClick={() => setConfirmBulkDelete(true)}
                  >
                    <Trash2 className="h-3 w-3" />Löschen
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={exitSelectMode}>
                    <X className="h-3 w-3" />Abbrechen
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setSelectMode(true)}>
                  <CheckSquare className="h-3 w-3" />Auswählen
                </Button>
              )
            )}

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

          <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{selectedCaseIds.size} Vorgänge endgültig löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Die ausgewählten Vorgänge inkl. zugehöriger Aktivitäten, Notizen und Unteraufgaben
                  werden unwiderruflich gelöscht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={bulkDeleteCases}>Endgültig löschen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <CompleteCaseDialog
            open={!!pendingCloseIds}
            onOpenChange={(o) => { if (!o) setPendingCloseIds(null); }}
            onConfirm={async (note, sendEmail) => {
              const ids = pendingCloseIds || [];
              for (const id of ids) {
                await completeCase(id, note, sendEmail);
              }
              if (ids.length > 1) exitSelectMode();
              setPendingCloseIds(null);
            }}
          />

          {/* Legend */}
          {!isProjects && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border bg-card/30 shrink-0 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Überfällig</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" />Fällig in ≤3 Tagen</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />In Arbeit (Zukunft)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Nicht begonnen</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500" />Aktiv ohne Endtermin</span>
            </div>
          )}

          {/* Kanban */}
          <div className="flex-1 overflow-x-auto p-4">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-12">Laden…</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                          <SortableContext items={col.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            {col.cards.map(c => (
                              <DraggableCase
                                key={c.id}
                                card={c}
                                onOpen={() => navigate(`/cases/${c.id}`)}
                                departmentName={!selectedDeptId ? departments.find(d => d.id === c.department_id)?.name : undefined}
                                selectable={selectMode}
                                selected={selectedCaseIds.has(c.id)}
                                onToggleSelect={() => toggleCaseSelected(c.id)}
                                bulkIds={Array.from(selectedCaseIds)}
                              />
                            ))}
                          </SortableContext>
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
