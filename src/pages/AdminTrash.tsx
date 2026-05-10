import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isMasterUser } from '@/lib/master-users';
import { formatDateTime } from '@/lib/case-utils';
import { Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface TrashedCase {
  id: string;
  case_no: string;
  project_name: string;
  client_name: string | null;
  status: string;
  department_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface ProfileLite { id: string; short_code: string; display_name: string; }
interface DeptLite { id: string; name: string; }

const PURGE_DAYS = 90;

export default function AdminTrash() {
  const { user } = useAuth();
  const isMaster = isMasterUser(user?.id);
  const [rows, setRows] = useState<TrashedCase[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [depts, setDepts] = useState<Record<string, DeptLite>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_no, project_name, client_name, status, department_id, deleted_at, deleted_by')
      .eq('deleted', true)
      .order('deleted_at', { ascending: false })
      .limit(500);
    if (error) { toast.error('Fehler beim Laden: ' + error.message); setLoading(false); return; }
    const list = (data || []) as TrashedCase[];
    setRows(list);

    const userIds = Array.from(new Set(list.map(r => r.deleted_by).filter(Boolean) as string[]));
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
    if (!isMaster) return;
    fetchData();
  }, [isMaster]);

  if (!isMaster) {
    return <AppLayout><p className="text-xs text-destructive">Nur für Master-Nutzer</p></AppLayout>;
  }

  const restore = async (r: TrashedCase) => {
    setBusyId(r.id);
    const { error } = await supabase
      .from('cases')
      .update({ deleted: false, deleted_at: null, deleted_by: null } as any)
      .eq('id', r.id);
    setBusyId(null);
    if (error) { toast.error('Wiederherstellen fehlgeschlagen: ' + error.message); return; }
    toast.success(`Vorgang ${r.case_no} wiederhergestellt`);
    setRows(rs => rs.filter(x => x.id !== r.id));
  };

  const hardDelete = async (r: TrashedCase) => {
    setBusyId(r.id);
    const { error } = await supabase.from('cases').delete().eq('id', r.id);
    setBusyId(null);
    if (error) { toast.error('Endgültig löschen fehlgeschlagen: ' + error.message); return; }
    toast.success(`Vorgang ${r.case_no} endgültig gelöscht`);
    setRows(rs => rs.filter(x => x.id !== r.id));
  };

  const daysLeft = (deletedAt: string | null): number | null => {
    if (!deletedAt) return null;
    const ms = new Date(deletedAt).getTime() + PURGE_DAYS * 86_400_000 - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Papierkorb</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Soft-gelöschte Vorgänge. Werden nach {PURGE_DAYS} Tagen automatisch endgültig entfernt.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gelöscht am</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Verbleibend</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Gelöscht von</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Vorgangs-Nr.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Projektname</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Auftraggeber</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Abteilung</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">Laden</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">Papierkorb ist leer</td></tr>
              ) : rows.map(r => {
                const dl = daysLeft(r.deleted_at);
                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{r.deleted_at ? formatDateTime(r.deleted_at) : '–'}</td>
                    <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">{dl === null ? '–' : `${dl} Tage`}</td>
                    <td className="px-3 py-2 text-xs text-foreground">{r.deleted_by ? (profiles[r.deleted_by]?.short_code || profiles[r.deleted_by]?.display_name || '–') : '–'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-foreground">{r.case_no}</td>
                    <td className="px-3 py-2 text-xs text-foreground">{r.project_name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.client_name || '–'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.department_id ? (depts[r.department_id]?.name || '–') : '–'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === r.id} onClick={() => restore(r)}>
                          <RotateCcw className="h-3 w-3" />Wiederherstellen
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busyId === r.id}>
                              <Trash2 className="h-3 w-3" />Endgültig löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Vorgang endgültig löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Der Vorgang {r.case_no} – {r.project_name} sowie alle verknüpften Notizen,
                                Unteraufgaben, E-Mails und Aktivitäten werden unwiderruflich entfernt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => hardDelete(r)}>Endgültig löschen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{rows.length} Eintrag/Einträge</p>
      </div>
    </AppLayout>
  );
}
