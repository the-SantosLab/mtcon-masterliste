import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Download, RotateCcw, DatabaseBackup, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface BackupRow {
  id: string;
  created_at: string;
  trigger: string;
  storage_path: string;
  size_bytes: number | null;
  tables_count: number | null;
  rows_count: number | null;
  status: string;
  note: string | null;
  error: string | null;
}

interface TableCheck { table: string; expected: number; actual: number; diff: number; ok: boolean; error?: string }
interface FileCheck { bucket: string; expected: number; present: number; missing: number; size_mismatch: number; extra: number; ok: boolean; samples: string[] }

interface RestoreRun {
  id: string;
  created_at: string;
  finished_at: string | null;
  backup_created_at: string | null;
  status: string;
  rows_inserted: number;
  files_restored: number;
  files_failed: number;
  bytes_restored: number;
  issues_count: number;
  duration_ms: number | null;
  table_checks: TableCheck[] | null;
  file_checks: FileCheck[] | null;
  error: string | null;
}

function fmtSize(b: number | null) {
  if (!b) return '–';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function AdminBackups() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [runs, setRuns] = useState<RestoreRun[]>([]);
  const [runDetail, setRunDetail] = useState<RestoreRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState<BackupRow | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);


  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from('backups').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) toast.error(error.message);
    else setRows((data as BackupRow[]) ?? []);
    setBusy(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const createNow = async () => {
    setCreating(true);
    const { error } = await supabase.functions.invoke('create-backup', { body: { trigger: 'manual' } });
    if (error) toast.error(error.message); else toast.success('Backup erstellt');
    setCreating(false);
    load();
  };

  const download = async (row: BackupRow) => {
    const { data, error } = await supabase.functions.invoke('download-backup', {
      method: 'GET' as any,
      // pass id via query string: invoke doesn't support GET well; build URL manually
    } as any);
    // fallback to direct URL
    if (!data || error) {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`https://tfzwssplxetptxnhrxse.supabase.co/functions/v1/download-backup?id=${row.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Download fehlgeschlagen'); return; }
      window.open(json.url, '_blank');
      return;
    }
    if ((data as any).url) window.open((data as any).url, '_blank');
  };

  const doRestore = async () => {
    if (!restoreOpen) return;
    setRestoring(true);
    const { error } = await supabase.functions.invoke('restore-backup', { body: { backup_id: restoreOpen.id } });
    if (error) toast.error(error.message);
    else toast.success('Wiederherstellung abgeschlossen');
    setRestoring(false);
    setRestoreOpen(null);
    setConfirmText('');
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Backups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tägliche automatische Sicherungen um 09:00 und 15:00 Uhr. Zusätzlich können Sicherungen manuell erstellt und frühere Stände wiederhergestellt werden.
            </p>
          </div>
          <Button onClick={createNow} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseBackup className="h-4 w-4 mr-2" />}
            Backup jetzt erstellen
          </Button>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Erstellt</TableHead>
                <TableHead>Auslöser</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Datensätze</TableHead>
                <TableHead className="text-right">Größe</TableHead>
                <TableHead>Notiz</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {busy && rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Lade…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Noch keine Backups.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString('de-DE')}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {r.trigger === 'schedule' ? 'Geplant' : r.trigger === 'pre_restore' ? 'Vor Wiederherstellung' : 'Manuell'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.status === 'success' ? <Badge>Erfolgreich</Badge>
                      : r.status === 'failed' ? <Badge variant="destructive">Fehlgeschlagen</Badge>
                      : r.status === 'running' ? <Badge variant="secondary">Läuft…</Badge>
                      : <Badge variant="secondary">{r.status}</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.rows_count ?? '–'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtSize(r.size_bytes)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.note || r.error || ''}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" disabled={r.status !== 'success'} onClick={() => download(r)}>
                      <Download className="h-3.5 w-3.5 mr-1" />Download
                    </Button>
                    <Button size="sm" variant="destructive" disabled={r.status !== 'success'} onClick={() => setRestoreOpen(r)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />Wiederherstellen
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!restoreOpen} onOpenChange={(o) => { if (!o) { setRestoreOpen(null); setConfirmText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stand wiederherstellen</DialogTitle>
            <DialogDescription>
              Der gewählte Backup-Stand vom {restoreOpen && new Date(restoreOpen.created_at).toLocaleString('de-DE')} wird vollständig wiederhergestellt.
              Alle aktuellen Daten in den betroffenen Tabellen werden überschrieben. Vor der Wiederherstellung wird automatisch ein Sicherheits-Backup angelegt.
              Zur Bestätigung bitte <strong>WIEDERHERSTELLEN</strong> eingeben.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="WIEDERHERSTELLEN" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreOpen(null); setConfirmText(''); }}>Abbrechen</Button>
            <Button variant="destructive" disabled={confirmText !== 'WIEDERHERSTELLEN' || restoring} onClick={doRestore}>
              {restoring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Endgültig wiederherstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
