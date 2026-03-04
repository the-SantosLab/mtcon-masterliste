import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { DepartmentTreeView } from '@/components/DepartmentTreeView';
import { CreateCaseFromDeptDialog } from '@/components/CreateCaseFromDeptDialog';
import { buildTree } from '@/lib/case-utils';
import type { Department, DepartmentNode } from '@/lib/case-utils';
import { Building2 } from 'lucide-react';

export default function OrgChart() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDeptId, setCreateDeptId] = useState<string | null>(null);

  const fetchData = async () => {
    const [deptRes, caseRes, profileRes] = await Promise.all([
      supabase.from('departments').select('*').order('sort_order'),
      supabase.from('cases').select('department_id').not('status', 'in', '("abgeschlossen","verworfen","archiv")'),
      supabase.from('users_profile').select('id, display_name').eq('active', true),
    ]);

    const depts = (deptRes.data || []) as Department[];
    const openCases = (caseRes.data || []) as { department_id: string | null }[];
    const profiles = (profileRes.data || []) as { id: string; display_name: string }[];

    const countMap = new Map<string, number>();
    openCases.forEach(c => {
      if (c.department_id) countMap.set(c.department_id, (countMap.get(c.department_id) || 0) + 1);
    });

    const profileMap = new Map(profiles.map(p => [p.id, p.display_name]));

    setDepartments(depts);
    const nodes = buildTree(depts);
    const enrich = (nodes: DepartmentNode[]) => {
      nodes.forEach(n => {
        n.case_count = countMap.get(n.id) || 0;
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
          <p className="text-xs text-muted-foreground mt-0.5">Abteilungen, Teilbereiche und offene Vorgänge</p>
        </div>

        <div className="rounded-md border border-border bg-card p-3">
          {loading ? (
            <p className="text-xs text-muted-foreground p-4 text-center">Laden…</p>
          ) : (
            <DepartmentTreeView
              nodes={tree}
              onCreateCase={id => setCreateDeptId(id)}
              showCounts
            />
          )}
        </div>
      </div>

      <CreateCaseFromDeptDialog
        open={!!createDeptId}
        onClose={() => setCreateDeptId(null)}
        departmentId={createDeptId || undefined}
        departments={departments}
        onCreated={fetchData}
      />
    </AppLayout>
  );
}
