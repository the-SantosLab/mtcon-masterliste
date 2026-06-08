import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  detectImportType,
  readXlsx,
  runImport,
  IMPORT_TYPE_LABEL,
  type ImportType,
  type Row,
} from '@/lib/article-import';

type Pending = {
  file: File;
  type: ImportType;
  rows: Row[];
  headers: string[];
};

export default function AdminArticles() {
  const { isAdmin, loading } = useAuth();
  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Artikelstamm (ISSOS)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import, Browser und Verwendung der ISSOS-Artikel in der MSL
          </p>
        </div>
        <Tabs defaultValue="browse">
          <TabsList className="bg-secondary">
            <TabsTrigger value="browse" className="text-xs">Artikel</TabsTrigger>
            <TabsTrigger value="import" className="text-xs">Import</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Import-Log</TabsTrigger>
          </TabsList>
          <TabsContent value="browse"><BrowseTab /></TabsContent>
          <TabsContent value="import"><ImportTab /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ---------------- Import tab ----------------
function ImportTab() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Pending[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ file: string; ok: boolean; msg: string }[]>([]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const newPending: Pending[] = [];
    for (const f of Array.from(files)) {
      const type = detectImportType(f.name);
      if (!type) {
        toast.error(`Typ nicht erkannt: ${f.name}`);
        continue;
      }
      try {
        const { headers, rows } = await readXlsx(f);
        newPending.push({ file: f, type, rows, headers });
      } catch (e: any) {
        toast.error(`Fehler beim Lesen: ${f.name} – ${e.message}`);
      }
    }
    setPending((p) => [...p, ...newPending]);
  };

  const runAll = async () => {
    if (!user) return;
    setRunning(true);
    setResults([]);
    // Run articles first, then everything else (children depend on art_nr)
    const order: ImportType[] = [
      'articles', 'status90', 'attributes',
      'prices', 'price_list_items',
      'customer_refs', 'supplier_refs', 'bom',
    ];
    const sorted = [...pending].sort(
      (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
    );
    const out: { file: string; ok: boolean; msg: string }[] = [];
    for (const p of sorted) {
      try {
        const r = await runImport(p.type, p.rows, user.id, p.file.name);
        // Archive raw file
        try {
          const path = `${new Date().toISOString().slice(0, 10)}/${p.type}/${Date.now()}_${p.file.name}`;
          await supabase.storage.from('article-imports').upload(path, p.file, { upsert: false });
        } catch {}
        out.push({
          file: p.file.name,
          ok: r.rowsFailed === 0,
          msg: `${r.rowsUpserted}/${r.rowsProcessed} übernommen${r.rowsFailed ? `, ${r.rowsFailed} Fehler` : ''} (${r.durationMs}ms)`,
        });
      } catch (e: any) {
        out.push({ file: p.file.name, ok: false, msg: e.message });
      }
      setResults([...out]);
    }
    setRunning(false);
    setPending([]);
    toast.success('Import abgeschlossen');
  };

  const remove = (i: number) => setPending((p) => p.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4 pt-4">
      <div className="rounded-md border border-border bg-card p-4">
        <label className="block cursor-pointer rounded-md border-2 border-dashed border-border bg-secondary/30 p-6 text-center hover:bg-secondary/50 transition-colors">
          <input
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <div className="text-xs font-medium">XLSX-Dateien wählen oder hierher ziehen</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Typ wird automatisch am Dateinamen erkannt (Artikel_Artikelstamm_…, Artikel_Artikelpreis_…, etc.)
          </div>
        </label>
      </div>

      {pending.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-xs font-medium">{pending.length} Datei(en) bereit</div>
            <Button size="sm" onClick={runAll} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Import starten
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Datei</TableHead>
                <TableHead className="text-[10px]">Typ</TableHead>
                <TableHead className="text-[10px] text-right">Zeilen</TableHead>
                <TableHead className="text-[10px]">Vorschau</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs"><FileSpreadsheet className="h-3 w-3 inline mr-1" />{p.file.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{IMPORT_TYPE_LABEL[p.type]}</Badge></TableCell>
                  <TableCell className="text-xs text-right">{p.rows.length}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground max-w-md truncate">
                    {p.headers.slice(0, 6).join(' · ')}…
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => remove(i)} disabled={running}>
                      Entfernen
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-md border border-border bg-card p-3 space-y-1.5">
          <div className="text-xs font-medium mb-2">Ergebnis</div>
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              <span className="font-mono">{r.file}</span>
              <span className="text-muted-foreground">— {r.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Browse tab ----------------
function BrowseTab() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const run = async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let base = (supabase as any)
        .from('articles')
        .select('art_nr,matchcode,bezeich_1,art_gr,me,art_stat,is_blocked', { count: 'exact' })
        .order('art_nr', { ascending: true })
        .range(from, to);

      if (q.trim()) {
        const t = q.trim();
        base = base.or(`art_nr.ilike.%${t}%,matchcode.ilike.%${t}%,bezeich_1.ilike.%${t}%`);
      }

      const { data, error, count } = await base;
      if (!cancel) {
        if (error) toast.error(error.message);
        setRows(data ?? []);
        setTotal(count ?? 0);
        setLoading(false);
      }
    };
    const t = setTimeout(run, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, page, pageSize]);

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-3 pt-4">
      <div className="relative max-w-md">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Suche nach Art.-Nr, Matchcode, Bezeichnung…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 text-xs pl-8"
        />
      </div>
      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">Art.-Nr</TableHead>
              <TableHead className="text-[10px]">Matchcode</TableHead>
              <TableHead className="text-[10px]">Bezeichnung</TableHead>
              <TableHead className="text-[10px]">Gruppe</TableHead>
              <TableHead className="text-[10px]">ME</TableHead>
              <TableHead className="text-[10px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-6">Lade…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-6">Keine Artikel</TableCell></TableRow>
            )}
            {!loading && rows.map((r) => (
              <TableRow key={r.art_nr}>
                <TableCell className="text-xs font-mono">{r.art_nr}</TableCell>
                <TableCell className="text-xs">{r.matchcode}</TableCell>
                <TableCell className="text-xs">{r.bezeich_1}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.art_gr}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.me}</TableCell>
                <TableCell>
                  {r.is_blocked
                    ? <Badge variant="destructive" className="text-[10px]">{r.art_stat}</Badge>
                    : <Badge variant="secondary" className="text-[10px]">{r.art_stat ?? '—'}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {total > 0 ? `${startItem}–${endItem} von ${total}` : '0 Treffer'}
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-7 text-[10px] bg-secondary border border-border rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span className="text-[10px] text-muted-foreground">pro Seite</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] px-2"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!canPrev || loading}
          >
            Zurück
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (totalPages <= 7) return true;
              if (p === 1 || p === totalPages) return true;
              if (Math.abs(p - page) <= 1) return true;
              return false;
            })
            .map((p, idx, arr) => {
              const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
              return (
                <span key={p} className="flex items-center gap-1">
                  {showEllipsis && <span className="text-[10px] text-muted-foreground px-1">…</span>}
                  <Button
                    variant={p === page ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 w-7 p-0 text-[10px]"
                    onClick={() => setPage(p)}
                    disabled={loading}
                  >
                    {p}
                  </Button>
                </span>
              );
            })}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] px-2"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!canNext || loading}
          >
            Weiter
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- History tab ----------------
function HistoryTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('article_import_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setRows(data ?? []);
    })();
  }, []);
  return (
    <div className="pt-4 rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px]">Zeitpunkt</TableHead>
            <TableHead className="text-[10px]">Datei</TableHead>
            <TableHead className="text-[10px]">Typ</TableHead>
            <TableHead className="text-[10px] text-right">Zeilen</TableHead>
            <TableHead className="text-[10px] text-right">Upsert</TableHead>
            <TableHead className="text-[10px] text-right">Fehler</TableHead>
            <TableHead className="text-[10px] text-right">Dauer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-xs text-center text-muted-foreground py-6">Noch keine Importe</TableCell></TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.created_at).toLocaleString('de-DE')}</TableCell>
              <TableCell className="text-xs font-mono truncate max-w-[260px]">{r.file_name}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{IMPORT_TYPE_LABEL[r.import_type as ImportType] ?? r.import_type}</Badge></TableCell>
              <TableCell className="text-xs text-right">{r.rows_processed}</TableCell>
              <TableCell className="text-xs text-right">{r.rows_inserted}</TableCell>
              <TableCell className="text-xs text-right">{r.rows_failed > 0 ? <span className="text-destructive">{r.rows_failed}</span> : 0}</TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">{r.duration_ms}ms</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
