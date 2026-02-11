import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { STATUS_LABELS, isTerminalStatus } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { GripHorizontal } from 'lucide-react';
import { toast } from 'sonner';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };
type CaseStatus = Enums<'case_status'>;

const KANBAN_STATUSES: CaseStatus[] = [
  'nicht_begonnen',
  'in_planung',
  'in_arbeit',
  'in_verzug',
  'abgeschlossen',
];

export default function CasesKanban() {
  const { user, isAdmin, isViewer } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedCase, setDraggedCase] = useState<string | null>(null);

  const fetchCases = async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCases();
    const ch = supabase.channel('kanban-cases').on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const canChangeStatus = (c: CaseRow) => !isViewer && (isAdmin || c.assignee_id === user?.id);

  const handleDragStart = (e: React.DragEvent, caseId: string) => {
    setDraggedCase(caseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: CaseStatus) => {
    e.preventDefault();
    if (!draggedCase) return;

    const caseItem = cases.find(c => c.id === draggedCase);
    if (!caseItem || !canChangeStatus(caseItem)) {
      toast.error('Keine Berechtigung');
      setDraggedCase(null);
      return;
    }

    if (caseItem.status === newStatus) {
      setDraggedCase(null);
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('cases')
      .update({
        status: newStatus,
        last_changed_by: user?.id,
        last_changed_at: now,
      })
      .eq('id', draggedCase);

    if (error) {
      toast.error('Fehler beim Aktualisieren');
      setDraggedCase(null);
      return;
    }

    await supabase.from('case_activity').insert({
      case_id: draggedCase,
      action: 'STATUS_CHANGE',
      actor_id: user?.id || '',
      field: 'status',
      old_value: caseItem.status,
      new_value: newStatus,
    });

    toast.success(`Status zu "${STATUS_LABELS[newStatus]}" geändert`);
    setDraggedCase(null);
    await fetchCases();
  };

  const groupedCases = KANBAN_STATUSES.reduce((acc, status) => {
    acc[status] = cases.filter(c => c.status === status);
    return acc;
  }, {} as Record<CaseStatus, CaseRow[]>);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Kanban</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Vorgänge nach Status</p>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground text-xs">Laden</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 auto-cols-fr">
            {KANBAN_STATUSES.map(status => (
              <div
                key={status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
                className="bg-card rounded-md border border-border p-4 min-h-[600px] flex flex-col space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-foreground">{STATUS_LABELS[status]}</h2>
                  <span className="text-xs text-muted-foreground font-medium">{groupedCases[status].length}</span>
                </div>

                <div className="space-y-2 flex-1">
                  {groupedCases[status].length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">–</p>
                  ) : (
                    groupedCases[status].map(c => (
                      <div
                        key={c.id}
                        draggable={canChangeStatus(c)}
                        onDragStart={(e) => handleDragStart(e, c.id)}
                        className={`
                          rounded border p-3 space-y-1.5 bg-background
                          ${draggedCase === c.id ? 'opacity-50 bg-muted/40' : ''}
                          ${canChangeStatus(c) ? 'cursor-move border-border hover:border-muted-foreground' : 'border-border/50'}
                          transition-all
                        `}
                      >
                        <div className="flex items-start gap-2">
                          {canChangeStatus(c) && <GripHorizontal className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-primary truncate">{c.case_no}</p>
                            <p className="text-xs text-foreground truncate">{c.project_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{c.assignee?.short_code || '–'}</span>
                          <span className="text-[10px] text-muted-foreground">{c.customer_no || '–'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
