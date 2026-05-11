import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/lib/case-utils';
import { Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface DeletedCase {
  id: string;
  case_id: string;
  case_no: string | null;
  project_name: string | null;
  client_name: string | null;
  customer_no: string | null;
  status: string | null;
  assignee_id: string | null;
  department_id: string | null;
  deleted_by: string | null;
  deleted_at: string;
  snapshot: any;
}

interface ProfileLite { id: string; short_code: string; display_name: string; }
interface DeptLite { id: string; name: string; }

export default function AdminDeletedCases() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<DeletedCase[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [depts, setDepts] = useState<Record<string, DeptLite>>({});
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('deleted_cases')
      .select('id, case_id, case_no, project_name, client_name, customer_no, status, assignee_id, department_id, deleted_by, deleted_at, snapshot')
      .order('deleted_at', { ascending: false })
      .limit(500);
    const list = (data || []) as DeletedCase[];
    setRows(list);

    const userIds = Array.from(new Set(list.flatMap(r => [r.deleted_by, r.assignee_id]).filter(Boolean) as string[]));
    const deptIds = Array.from(new Set(list.map(r => r.department_id).filter(Boolean) as string[]));
    const [pr, dr] = await Promise.all([
      userIds.length ? supabase.from('users_profile').select('id, short_code, display_name').in('id', userIds) : Promise.resolve({ data: [] as any }),
      deptIds.length ? supabase.from('departments').select('id, name').in('id', deptIds) : Promise.resolve({ data: [] as any }),
    ]);
    setProfiles(Object.fromEntries((pr.data || []).map((p: any) => [p.id, p])));
    setDepts(Object.fromEntries((dr.data || []).map((d: any) => [d.id, d])));
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  const restoreCase = async (row: DeletedCase) => {
    if (!row.snapshot) {
      toast.error('Kein Snapshot vorhanden – Wiederherstellung nicht möglich');
      return;
    }
    setRestoringId(row.id);
    try {
      const { error: rpcErr } = await supabase.rpc('restore_deleted_case' as any, { p_deleted_id: row.id });
      if (rpcErr) throw rpcErr;

      toast.success(`Vorgang ${row.case_no || ''} vollständig wiederhergestellt`);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (err: any) {
      console.error('restore failed', err);
      toast.error(err?.message || 'Wiederherstellung fehlgeschlagen');
    } finally {
      setRestoringId(null);
    }
  };

  if (!isAdmin) {
    return <AppLayout><p className="text-xs text-destructive">Nur für Admins</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Gelöschte Vorgänge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Audit-Protokoll aller endgültig gelöschten Vorgänge – mit Wiederherstellung</p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gelöscht am</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gelöscht von</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Vorgangs-Nr.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Projektname</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Auftraggeber</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Abteilung</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bearbeiter</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">Laden</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">Keine gelöschten Vorgänge protokolliert</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(r.deleted_at)}</td>
                  <td className="px-3 py-2 text-xs text-foreground">{r.deleted_by ? (profiles[r.deleted_by]?.short_code || profiles[r.deleted_by]?.display_name || '–') : '–'}</td>
                  <td className="px-3 py-2 text-xs font-mono text-foreground">{r.case_no || '–'}</td>
                  <td className="px-3 py-2 text-xs text-foreground">{r.project_name || '–'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.client_name || '–'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.department_id ? (depts[r.department_id]?.name || '–') : '–'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.assignee_id ? (profiles[r.assignee_id]?.short_code || '–') : '–'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.status || '–'}</td>
                  <td className="px-3 py-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          disabled={!r.snapshot || restoringId === r.id}
                        >
                          <Undo2 className="h-3 w-3" />
                          {restoringId === r.id ? 'Stelle wieder her…' : 'Wiederherstellen'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Vorgang wiederherstellen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Vorgang <span className="font-mono">{r.case_no}</span> ({r.project_name}) wird mit allen Stammdaten aus dem Snapshot wiederhergestellt.
                            Hinweis: Verknüpfte Unteraufgaben, Notizen, Anhänge und Aktivitätsverlauf können nicht wiederhergestellt werden, sofern sie beim Löschen kaskadiert entfernt wurden.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => restoreCase(r)}>Wiederherstellen</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{rows.length} Eintrag/Einträge</p>
      </div>
    </AppLayout>
  );
}
