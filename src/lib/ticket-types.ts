// Local types for tickets system (until types.ts regenerates)

export interface Department {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  manager_user_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[];
  ticket_count?: number;
  head_name?: string;
}

export interface Ticket {
  id: string;
  ticket_key: string;
  title: string;
  description: string | null;
  department_id: string;
  created_by: string | null;
  assigned_to: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  department_name?: string;
  assignee_name?: string;
  creator_name?: string;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  from_department_id: string | null;
  to_department_id: string | null;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  meta: Record<string, any>;
  created_at: string;
  // joined
  actor_name?: string;
  from_dept_name?: string;
  to_dept_name?: string;
}

export const TICKET_STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export const STATUS_LABELS: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-[hsl(var(--status-open))]',
  in_progress: 'bg-[hsl(var(--status-working))]',
  blocked: 'bg-[hsl(var(--status-overdue))]',
  done: 'bg-[hsl(var(--status-done))]',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-[hsl(var(--status-planning))]',
  high: 'text-[hsl(var(--status-overdue))]',
  urgent: 'text-[hsl(var(--status-rejected))]',
};

export function buildTree(departments: Department[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>();
  const roots: DepartmentNode[] = [];

  departments.forEach(d => map.set(d.id, { ...d, children: [] }));
  departments.forEach(d => {
    const node = map.get(d.id)!;
    if (d.parent_id && map.has(d.parent_id)) {
      map.get(d.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: DepartmentNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}
