import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { STATUS_LABELS, STATUS_DOT_COLORS, buildTree } from '@/lib/case-utils';
import type { Department, DepartmentNode } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { CreateCaseFromDeptDialog } from '@/components/CreateCaseFromDeptDialog';
import { CaseKanbanCard } from '@/components/CaseKanbanCard';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CaseStatus = Enums<'case_status'>;
type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

interface CardData {
  id: string;
  case_no: string;
  project_name: string;
  status: string;
  due_at: string | null;
  department_id: string | null;
  assignee_short_code?: string;
}

const KANBAN_STATUSES: CaseStatus[] = [
  'nicht_begonnen',
  'in_planung',
  'in_arbeit',
  'in_verzug',
  'abgeschlossen',
];

function DraggableCase({ card }: { card: CardData }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <CaseKanbanCard caseItem={card} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({ id, label, cards, color }: { id: string; label: string; cards: CardData[]; color?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[220px] max-w-[320px] rounded-lg border border-border bg-muted/30 flex flex-col',
        isOver && 'ring-2 ring-primary/30 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        {color && <span className={cn('h-2 w-2 rounded-full', color)} />}
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{cards.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {cards.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-8">Keine Vorgänge</p>
        )}
        {cards.map(c => (
          <DraggableCase key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}

export default function CasesKanban() {
  const { user, isAdmin, isViewer } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [profiles, setProfiles] = useState<Tables<'users_profile'>[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase.from('departments').select('*').order('sort_order');
    const depts = (data || []) as Department[];
    setDepartments(depts);
    setTree(buildTree(depts));
    if (!selectedDeptId && depts.length > 0) {
      const topLevel = depts.find(d => !d.parent_id);
      if (topLevel) setSelectedDeptId(topLevel.id);
    }
  }, [selectedDeptId]);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchCases();
    supabase.from('users_profile').select('*').then(r => setProfiles((r.data || []) as any[]));
    const ch = supabase.channel('kanban-cases').on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const selectedDept = departments.find(d => d.id === selectedDeptId);
  const childDepts = departments.filter(d => d.parent_id === selectedDeptId);
  const hasChildren = childDepts.length > 0;

  // Filter cases to selected department scope
  const scopedCases = selectedDeptId
    ? cases.filter(c => {
        const childIds = departments.filter(d => d.parent_id === selectedDeptId).map(d => d.id);
        return c.department_id === selectedDeptId || childIds.includes(c.department_id || '');
      })
    : cases;

  // Apply search/filter
  let filtered = scopedCases;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.case_no.toLowerCase().includes(q) ||
      c.project_name.toLowerCase().includes(q) ||
      (c.client_name || '').toLowerCase().includes(q)
    );
  }
  if (assigneeFilter !== 'all') {
    filtered = filtered.filter(c => c.assignee_id === assigneeFilter);
  }

  // Build cards
  const toCard = (c: CaseRow): CardData => ({
    id: c.id,
    case_no: c.case_no,
    project_name: c.project_name,
    status: c.status,
    due_at: c.due_at,
    department_id: c.department_id,
    assignee_short_code: c.assignee?.short_code,
  });

  // Build columns
  let columns: { id: string; label: string; cards: CardData[]; color?: string }[] = [];
  if (hasChildren && selectedDeptId) {
    columns = childDepts.map(d => ({
      id: d.id,
      label: d.name,
      cards: filtered.filter(c => c.department_id === d.id).map(toCard),
    }));
    const parentCards = filtered.filter(c => c.department_id === selectedDeptId).map(toCard);
    if (parentCards.length > 0) {
      columns.unshift({ id: selectedDeptId, label: selectedDept?.name || 'Direkt', cards: parentCards });
    }
  } else {
    columns = KANBAN_STATUSES.map(s => ({
      id: s,
      label: STATUS_LABELS[s],
      cards: filtered.filter(c => c.status === s).map(toCard),
      color: STATUS_DOT_COLORS[s],
    }));
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveCard(e.active.data.current?.card || null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over || !active) return;
    const card = (active.data.current as any)?.card as CardData;
    if (!card) return;
    const targetId = over.id as string;

    if (hasChildren) {
      if (card.department_id === targetId) return;
      const { error } = await supabase.rpc('move_case_department' as any, { p_case_id: card.id, p_to_department_id: targetId });
      if (error) { toast.error(error.message); return; }
      const targetDept = departments.find(d => d.id === targetId);
      toast.success(`Vorgang nach "${targetDept?.name}" verschoben`);
    } else {
      if (card.status === targetId) return;
      const { error } = await supabase.rpc('change_case_status_rpc' as any, { p_case_id: card.id, p_to_status: targetId });
      if (error) { toast.error(error.message); return; }
      toast.success(`Status auf "${STATUS_LABELS[targetId as CaseStatus]}" geändert`);
    }
    fetchCases();
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-7rem)] gap-0 -m-5 lg:-m-8">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-border bg-card/50 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs font-semibold text-foreground">Abteilungen</span>
          </div>
          <DepartmentTreeView
            nodes={tree}
            selectedId={selectedDeptId}
            onSelect={setSelectedDeptId}
            compact
          />
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{selectedDept?.name || 'Kanban'}</h2>
            <span className="text-[10px] text-muted-foreground">
              {hasChildren ? 'Spalten = Teilbereiche' : 'Spalten = Status'}
            </span>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7 w-40"
              />
            </div>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Bearbeiter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Alle</SelectItem>
                {profiles.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.short_code}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3" />Vorgang
            </Button>
          </div>

          {/* Kanban */}
          <div className="flex-1 overflow-x-auto p-4">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-12">Laden…</p>
            ) : !selectedDeptId ? (
              <p className="text-xs text-muted-foreground text-center py-12">Wähle eine Abteilung</p>
            ) : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-3 h-full">
                  {columns.map(col => (
                    <DroppableColumn key={col.id} id={col.id} label={col.label} cards={col.cards} color={col.color} />
                  ))}
                </div>
                <DragOverlay>
                  {activeCard && <CaseKanbanCard caseItem={activeCard} isDragging />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      <CreateCaseFromDeptDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departmentId={selectedDeptId || undefined}
        departments={departments}
        onCreated={fetchCases}
      />
    </AppLayout>
  );
}
