import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buildTree } from '@/lib/case-utils';
import type { Department, DepartmentNode } from '@/lib/case-utils';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, FolderKanban, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

const PROJECT_STATUSES: { id: string; label: string; color: string }[] = [
  { id: 'active', label: 'Aktiv', color: 'bg-[hsl(var(--status-working))]' },
  { id: 'on_hold', label: 'Pausiert', color: 'bg-[hsl(var(--status-planning))]' },
  { id: 'completed', label: 'Abgeschlossen', color: 'bg-[hsl(var(--status-done))]' },
  { id: 'archived', label: 'Archiviert', color: 'bg-[hsl(var(--status-archive))]' },
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

function DraggableProject({ card, onOpen }: { card: ProjectCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <ProjectKanbanCard project={card} onOpen={onOpen} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({ id, label, color, cards, onOpen }: { id: string; label: string; color: string; cards: ProjectCard[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[240px] max-w-[340px] rounded-lg border border-border bg-muted/30 flex flex-col',
        isOver && 'ring-2 ring-primary/30 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className={cn('h-2 w-2 rounded-full', color)} />
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{cards.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {cards.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-8">Keine Projekte</p>
        )}
        {cards.map(c => (
          <DraggableProject key={c.id} card={c} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  );
}

export default function CasesKanban() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<ProjectCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchProjects();
    const ch = supabase.channel('kanban-projects').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Scope by selected department (incl. children)
  const scoped = selectedDeptId
    ? projects.filter(p => {
        const childIds = departments.filter(d => d.parent_id === selectedDeptId).map(d => d.id);
        return p.department_id === selectedDeptId || childIds.includes(p.department_id || '');
      })
    : projects;

  const filtered = searchQuery
    ? scoped.filter(p => {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.project_number || '').toLowerCase().includes(q);
      })
    : scoped;

  const columns = PROJECT_STATUSES.map(s => ({
    ...s,
    cards: filtered.filter(p => p.status === s.id),
  }));

  const handleDragStart = (e: DragStartEvent) => {
    setActiveCard(e.active.data.current?.card || null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over || !active) return;
    const card = (active.data.current as any)?.card as ProjectCard;
    if (!card) return;
    const targetStatus = over.id as string;
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
  };

  const selectedDept = departments.find(d => d.id === selectedDeptId);

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
          />
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {selectedDept?.name || 'Alle Projekte'}
            </h2>
            <span className="text-[10px] text-muted-foreground">Spalten = Projekt-Status</span>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Projekt suchen…"
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
                  {columns.map(col => (
                    <DroppableColumn
                      key={col.id}
                      id={col.id}
                      label={col.label}
                      color={col.color}
                      cards={col.cards}
                      onOpen={(id) => navigate(`/projects/${id}`)}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeCard && <ProjectKanbanCard project={activeCard} isDragging />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
