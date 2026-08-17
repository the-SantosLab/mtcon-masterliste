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
    const [{ data, error }, { data: runData, error: runErr }] = await Promise.all([
      supabase.from('backups').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('restore_runs').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (error) toast.error(error.message);
    else setRows((data as BackupRow[]) ?? []);
    if (runErr) toast.error(runErr.message);
    else setRuns((runData as unknown as RestoreRun[]) ?? []);
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
    const { data, error } = await supabase.functions.invoke('restore-backup', { body: { backup_id: restoreOpen.id } });
    if (error) toast.error(error.message);
    else {
      const res = data as any;
      if (res?.status === 'warning') toast.warning(`Wiederherstellung abgeschlossen – Validierung meldet ${res.issues_count} Abweichung(en)`);
      else toast.success('Wiederherstellung abgeschlossen – Validierung ohne Befund');
    }
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

        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Wiederherstellungen &amp; Validierung</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Nach jeder Wiederherstellung wird automatisch geprüft, ob alle Tabellen-Datensätze und Dateien vollständig zurückgespielt wurden.
            </p>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitpunkt</TableHead>
                  <TableHead>Backup-Stand</TableHead>
                  <TableHead>Ergebnis</TableHead>
                  <TableHead className="text-right">Datensätze</TableHead>
                  <TableHead className="text-right">Dateien</TableHead>
                  <TableHead className="text-right">Abweichungen</TableHead>
                  <TableHead className="text-right">Dauer</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Noch keine Wiederherstellungen.</TableCell></TableRow>
                ) : runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.backup_created_at ? new Date(r.backup_created_at).toLocaleString('de-DE') : '–'}
                    </TableCell>
                    <TableCell>
                      {r.status === 'success' ? (
                        <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />Validiert</Badge>
                      ) : r.status === 'warning' ? (
                        <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" />Mit Hinweisen</Badge>
                      ) : r.status === 'failed' ? (
                        <Badge variant="destructive">Fehlgeschlagen</Badge>
                      ) : (
                        <Badge variant="secondary">Läuft…</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.rows_inserted}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.files_restored}{r.files_failed > 0 ? ` (${r.files_failed} fehlerhaft)` : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.issues_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : '–'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setRunDetail(r)}>Bericht</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={!!runDetail} onOpenChange={(o) => { if (!o) setRunDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validierungsbericht</DialogTitle>
            <DialogDescription>
              Wiederherstellung vom {runDetail && new Date(runDetail.created_at).toLocaleString('de-DE')} ·{' '}
              {runDetail?.issues_count ?? 0} Abweichung(en)
            </DialogDescription>
          </DialogHeader>

          {runDetail?.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">{runDetail.error}</div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tabellen</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tabelle</TableHead>
                    <TableHead className="text-right">Erwartet</TableHead>
                    <TableHead className="text-right">Vorhanden</TableHead>
                    <TableHead className="text-right">Differenz</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runDetail?.table_checks ?? []).map((t) => (
                    <TableRow key={t.table} className={t.ok ? '' : 'bg-destructive/5'}>
                      <TableCell className="font-mono text-xs">{t.table}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.expected}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.actual < 0 ? '–' : t.actual}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.error ? <span className="text-xs text-destructive">{t.error}</span> : t.diff === 0 ? '0' : (t.diff > 0 ? `+${t.diff}` : t.diff)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Dateien</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bereich</TableHead>
                    <TableHead className="text-right">Erwartet</TableHead>
                    <TableHead className="text-right">Vorhanden</TableHead>
                    <TableHead className="text-right">Fehlend</TableHead>
                    <TableHead className="text-right">Abweichende Größe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runDetail?.file_checks ?? []).map((f) => (
                    <TableRow key={f.bucket} className={f.ok ? '' : 'bg-destructive/5'}>
                      <TableCell className="font-mono text-xs">{f.bucket}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.expected}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.present}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.missing}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.size_mismatch}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {(runDetail?.file_checks ?? []).some((f) => f.samples?.length) && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                {(runDetail?.file_checks ?? []).flatMap((f) => (f.samples ?? []).map((s) => `${f.bucket}: ${s}`)).slice(0, 30).map((s, i) => (
                  <div key={i} className="font-mono">{s}</div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDetail(null)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



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
