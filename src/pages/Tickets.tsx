import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { CreateTicketDialog } from '@/components/CreateTicketDialog';
import { TicketCard } from '@/components/TicketCard';
import { buildTree, TICKET_STATUSES, STATUS_LABELS } from '@/lib/ticket-types';
import type { Department, DepartmentNode, Ticket } from '@/lib/ticket-types';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function DraggableTicket({ ticket }: { ticket: Ticket }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, data: { ticket } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <TicketCard ticket={ticket} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({ id, label, tickets, color }: { id: string; label: string; tickets: Ticket[]; color?: string }) {
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
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{tickets.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {tickets.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-8">Keine Tickets</p>
        )}
        {tickets.map(t => (
          <DraggableTicket key={t.id} ticket={t} />
        ))}
      </div>
    </div>
  );
}

export default function Tickets() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase.from('departments').select('*').order('sort_order');
    const depts = (data || []) as Department[];
    setDepartments(depts);
    setTree(buildTree(depts));
    if (!selectedDeptId && depts.length > 0) {
      // Select first top-level
      const topLevel = depts.find(d => !d.parent_id);
      if (topLevel) setSelectedDeptId(topLevel.id);
    }
    setLoading(false);
  }, [selectedDeptId]);

  const fetchTickets = useCallback(async () => {
    if (!selectedDeptId) return;
    // Get selected dept and its children
    const childIds = departments.filter(d => d.parent_id === selectedDeptId).map(d => d.id);
    const allIds = [selectedDeptId, ...childIds];

    const { data } = await supabase
      .from('tickets' as any)
      .select('*')
      .in('department_id', allIds)
      .order('created_at', { ascending: false }) as any;

    // Fetch assignee names
    const tickets = (data || []) as unknown as Ticket[];
    const userIds = [...new Set(tickets.map(t => t.assigned_to).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('users_profile').select('id, display_name').in('id', userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name]));
      tickets.forEach(t => { if (t.assigned_to) t.assignee_name = profileMap.get(t.assigned_to); });
    }
    setTickets(tickets);
  }, [selectedDeptId, departments]);

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { if (selectedDeptId && departments.length > 0) fetchTickets(); }, [selectedDeptId, departments]);

  const selectedDept = departments.find(d => d.id === selectedDeptId);
  const childDepts = departments.filter(d => d.parent_id === selectedDeptId);
  const hasChildren = childDepts.length > 0;

  // Filter tickets
  let filtered = tickets;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.ticket_key.toLowerCase().includes(q));
  }
  if (filterStatus !== 'all') filtered = filtered.filter(t => t.status === filterStatus);
  if (filterPriority !== 'all') filtered = filtered.filter(t => t.priority === filterPriority);

  // Build columns
  let columns: { id: string; label: string; tickets: Ticket[]; color?: string }[] = [];
  if (hasChildren) {
    // Columns = child departments
    columns = childDepts.map(d => ({
      id: d.id,
      label: d.name,
      tickets: filtered.filter(t => t.department_id === d.id),
    }));
    // Add column for tickets directly in parent
    const parentTickets = filtered.filter(t => t.department_id === selectedDeptId);
    if (parentTickets.length > 0) {
      columns.unshift({ id: selectedDeptId!, label: selectedDept?.name || 'Direkt', tickets: parentTickets });
    }
  } else {
    // Columns = statuses
    const statusColors: Record<string, string> = {
      open: 'bg-[hsl(var(--status-open))]',
      in_progress: 'bg-[hsl(var(--status-working))]',
      blocked: 'bg-[hsl(var(--status-overdue))]',
      done: 'bg-[hsl(var(--status-done))]',
    };
    columns = TICKET_STATUSES.map(s => ({
      id: s,
      label: STATUS_LABELS[s],
      tickets: filtered.filter(t => t.status === s),
      color: statusColors[s],
    }));
  }

  const handleDragStart = (e: DragStartEvent) => {
    setActiveTicket(e.active.data.current?.ticket || null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTicket(null);
    const { active, over } = e;
    if (!over || !active) return;
    const ticket = (active.data.current as any)?.ticket as Ticket;
    if (!ticket) return;
    const targetId = over.id as string;

    if (hasChildren) {
      // Moving between departments
      if (ticket.department_id === targetId) return;
      const { error } = await supabase.rpc('move_ticket', { p_ticket_id: ticket.id, p_to_department_id: targetId });
      if (error) { toast.error(error.message); return; }
      const targetDept = departments.find(d => d.id === targetId);
      toast.success(`Ticket nach "${targetDept?.name}" verschoben`);
    } else {
      // Moving between statuses
      if (ticket.status === targetId) return;
      const { error } = await supabase.rpc('change_ticket_status', { p_ticket_id: ticket.id, p_to_status: targetId });
      if (error) { toast.error(error.message); return; }
      toast.success(`Status auf "${STATUS_LABELS[targetId]}" geändert`);
    }
    fetchTickets();
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
            <h2 className="text-sm font-semibold text-foreground truncate">{selectedDept?.name || 'Tickets'}</h2>
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
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Alle Status</SelectItem>
                {TICKET_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3 w-3" />Ticket
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
                    <DroppableColumn key={col.id} id={col.id} label={col.label} tickets={col.tickets} color={col.color} />
                  ))}
                </div>
                <DragOverlay>
                  {activeTicket && <TicketCard ticket={activeTicket} isDragging />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      <CreateTicketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departmentId={selectedDeptId || undefined}
        departments={departments}
        onCreated={fetchTickets}
      />
    </AppLayout>
  );
}
