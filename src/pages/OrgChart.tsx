import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { CreateTicketDialog } from '@/components/CreateTicketDialog';
import { buildTree } from '@/lib/ticket-types';
import type { Department, DepartmentNode } from '@/lib/ticket-types';
import { Building2 } from 'lucide-react';

export default function OrgChart() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDeptId, setCreateDeptId] = useState<string | null>(null);

  const fetchData = async () => {
    const [deptRes, ticketRes, profileRes] = await Promise.all([
      supabase.from('departments').select('*').order('sort_order'),
      supabase.from('tickets' as any).select('department_id').neq('status', 'done'),
      supabase.from('users_profile').select('id, display_name').eq('active', true),
    ]);

    const depts = (deptRes.data || []) as Department[];
    const tickets = (ticketRes.data || []) as { department_id: string }[];
    const profiles = (profileRes.data || []) as { id: string; display_name: string }[];

    // Count tickets per department
    const countMap = new Map<string, number>();
    tickets.forEach(t => countMap.set(t.department_id, (countMap.get(t.department_id) || 0) + 1));

    // Profile map
    const profileMap = new Map(profiles.map(p => [p.id, p.display_name]));

    setDepartments(depts);
    const nodes = buildTree(depts);
    // Enrich nodes
    const enrich = (nodes: DepartmentNode[]) => {
      nodes.forEach(n => {
        n.ticket_count = countMap.get(n.id) || 0;
        n.head_name = n.manager_user_id ? profileMap.get(n.manager_user_id) || undefined : undefined;
        enrich(n.children);
      });
    };
    enrich(nodes);
    setTree(nodes);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organigramm
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Abteilungen, Teilbereiche und offene Tickets</p>
        </div>

        <div className="rounded-md border border-border bg-card p-3">
          {loading ? (
            <p className="text-xs text-muted-foreground p-4 text-center">Laden…</p>
          ) : (
            <DepartmentTreeView
              nodes={tree}
              onCreateTicket={id => setCreateDeptId(id)}
              showCounts
            />
          )}
        </div>
      </div>

      <CreateTicketDialog
        open={!!createDeptId}
        onClose={() => setCreateDeptId(null)}
        departmentId={createDeptId || undefined}
        departments={departments}
        onCreated={fetchData}
      />
    </AppLayout>
  );
}
