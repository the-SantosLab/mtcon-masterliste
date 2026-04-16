import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileText, AlertCircle, CheckCircle2, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Database } from '@/integrations/supabase/types';

type CaseStatus = Database['public']['Enums']['case_status'];

/* ── All CSV column headers ── */
const CSV_HEADERS = [
  'Titel (Projektname)',
  'Beschreibung (Aktion)',
  'Abteilung',
  'Bearbeiter',
  'Auftraggeber',
  'Kundennummer',
  'Produktcode',
  'Bereich intern',
  'Projekt-/Artikelnr.',
  'Status',
  'Priorität',
  'Geschätzte Stunden',
  'Menge',
  'SOP',
  'Projektlaufzeit',
  'Fälligkeitsdatum',
  'Eingangsdatum',
  'Erledigt am',
  'Notiz',
  'Original-Nr',
];

/* ── Status mapping ── */
const STATUS_MAP: Record<string, CaseStatus> = {
  'abgeschlossen': 'abgeschlossen',
  'in verzug': 'in_verzug',
  'in arbeit': 'in_arbeit',
  'nicht begonnen': 'nicht_begonnen',
  'in planung': 'in_planung',
  'zur prüfung': 'ready_for_review',
  'blockiert': 'blocked',
  'verworfen': 'verworfen',
  'archiv': 'archiv',
};

function mapStatus(raw: string): CaseStatus {
  if (!raw) return 'nicht_begonnen';
  return STATUS_MAP[raw.trim().toLowerCase()] ?? 'nicht_begonnen';
}

/* ── CSV parser (handles quoted fields, auto-detects delimiter) ── */
function detectDelimiter(line: string): string {
  // Count occurrences outside quotes
  let semis = 0, commas = 0, inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && ch === ';') semis++;
    if (!inQ && ch === ',') commas++;
  }
  return semis > commas ? ';' : ',';
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { fields.push(current.trim()); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));
  return { headers, rows };
}

function parseDate(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseNumber(val: string): number | null {
  if (!val) return null;
  const n = Number(val.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseInt_(val: string): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

/* ── Types ── */
interface ParsedRow {
  project_name: string;
  description: string | null;
  department_name: string | null;
  assignee_name: string | null;
  client_name: string | null;
  customer_no: string | null;
  product_code: string | null;
  internal_area_code: string | null;
  project_article_no: string | null;
  status: CaseStatus;
  priority: string | null;
  estimated_hours: number | null;
  quantity: number | null;
  sop: string | null;
  project_duration: string | null;
  due_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  note: string | null;
  original_nr: string | null;
}

interface ImportError { line: number; reason: string; }
interface ImportResult { success: number; failed: number; skipped: ImportError[]; }

const STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen', in_planung: 'In Planung', in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug', abgeschlossen: 'Abgeschlossen', ready_for_review: 'Zur Prüfung',
  blocked: 'Blockiert', verworfen: 'Verworfen', archiv: 'Archiv',
};

/* ── Sample CSV ── */
function downloadSampleCSV() {
  const rows = [
    CSV_HEADERS.join(','),
    [
      '"[001] MCPin 2nd Gen – Werkzeugänderung"',
      '"Kosten der Werkzeugänderung prüfen"',
      '"Konstruktion"',
      '"Helena"',
      '"Müller GmbH"',
      '"10001"',
      '"WEB"',
      '"01"',
      '"ART-2024-001"',
      '"Abgeschlossen"',
      '"Hoch"',
      '"40"',
      '"100"',
      '"2024-02-01"',
      '"6 Wochen"',
      '"2024-03-15"',
      '"2024-01-10"',
      '"2024-03-14"',
      '"Resultat: INNERHALB VORGABE"',
      '"001"',
    ].join(','),
    [
      '"[002] SMD Relay – Technische Daten"',
      '"Kundenzeichnungen erstellen"',
      '"Konstruktion"',
      '"Danny"',
      '"Schmidt AG"',
      '"10002"',
      '"APP"',
      '"02"',
      '"ART-2024-002"',
      '"In Arbeit"',
      '"Mittel"',
      '"80"',
      '""',
      '""',
      '"3 Monate"',
      '"2024-04-30"',
      '"2024-02-01"',
      '""',
      '"Step-Dateien ausstehend"',
      '"002"',
    ].join(','),
    [
      '"[003] Gehäuse Redesign"',
      '"Neues Design nach Kundenvorgabe"',
      '"Konstruktion"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '"Nicht begonnen"',
      '"Niedrig"',
      '""',
      '""',
      '""',
      '""',
      '"2024-06-01"',
      '"2024-03-15"',
      '""',
      '""',
      '"003"',
    ].join(','),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'vorgaenge-import-vorlage.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success('Beispiel-CSV heruntergeladen');
}

/* ── Main Component ── */
export function CsvImport() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<ImportError[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseErrors([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      const errs: ImportError[] = [];

      const titleIdx = headers.findIndex(h =>
        h.toLowerCase().includes('titel') || h.toLowerCase().includes('projektname')
      );
      if (titleIdx === -1) {
        errs.push({ line: 1, reason: 'Spalte "Titel (Projektname)" nicht gefunden' });
        setParseErrors(errs);
        setParsed(null);
        return;
      }

      const colIdx = (search: string) =>
        headers.findIndex(h => h.toLowerCase().includes(search.toLowerCase()));

      const descIdx = colIdx('Beschreibung');
      const deptIdx = colIdx('Abteilung');
      const assigneeIdx = colIdx('Bearbeiter');
      const clientIdx = colIdx('Auftraggeber');
      const custNoIdx = colIdx('Kundennummer');
      const prodIdx = colIdx('Produktcode');
      const areaIdx = colIdx('Bereich intern');
      const artIdx = colIdx('Artikelnr');
      const statusIdx = colIdx('Status');
      const prioIdx = colIdx('Priorität');
      const hoursIdx = colIdx('Geschätzte Stunden');
      const qtyIdx = colIdx('Menge');
      const sopIdx = colIdx('SOP');
      const durIdx = colIdx('Projektlaufzeit');
      const dueIdx = colIdx('Fälligkeitsdatum');
      const receivedIdx = colIdx('Eingangsdatum');
      const doneIdx = colIdx('Erledigt am');
      const noteIdx = colIdx('Notiz');
      const origIdx = colIdx('Original-Nr');

      const get = (row: string[], idx: number) =>
        idx >= 0 && idx < row.length ? row[idx].replace(/^["']|["']$/g, '').trim() : '';

      const parsedRows: ParsedRow[] = [];
      rows.forEach((row, i) => {
        const title = get(row, titleIdx);
        if (!title) {
          errs.push({ line: i + 2, reason: 'Titel (Projektname) fehlt – übersprungen' });
          return;
        }

        const description = get(row, descIdx) || null;
        const noteField = get(row, noteIdx) || null;
        const combinedNote = [description, noteField].filter(Boolean).join('\n\n---\n\n') || null;

        parsedRows.push({
          project_name: title,
          description,
          department_name: get(row, deptIdx) || null,
          assignee_name: get(row, assigneeIdx) || null,
          client_name: get(row, clientIdx) || null,
          customer_no: get(row, custNoIdx) || null,
          product_code: get(row, prodIdx) || null,
          internal_area_code: get(row, areaIdx) || null,
          project_article_no: get(row, artIdx) || null,
          status: mapStatus(get(row, statusIdx)),
          priority: get(row, prioIdx) || null,
          estimated_hours: parseNumber(get(row, hoursIdx)),
          quantity: parseInt_(get(row, qtyIdx)),
          sop: get(row, sopIdx) || null,
          project_duration: get(row, durIdx) || null,
          due_at: parseDate(get(row, dueIdx)),
          received_at: parseDate(get(row, receivedIdx)),
          completed_at: parseDate(get(row, doneIdx)),
          note: combinedNote,
          original_nr: get(row, origIdx) || null,
        });
      });

      setParseErrors(errs);
      setParsed(parsedRows);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const doImport = async () => {
    if (!parsed || parsed.length === 0 || !user) return;
    setImporting(true);
    setImportProgress({ current: 0, total: parsed.length });

    // Lookups
    const { data: departments } = await supabase.from('departments').select('id, name');
    const deptMap = new Map(departments?.map(d => [d.name.toLowerCase(), d.id]) || []);

    const { data: usersData } = await supabase.from('users_profile').select('id, display_name, short_code');
    const userMap = new Map<string, string>();
    usersData?.forEach(u => {
      userMap.set(u.display_name.toLowerCase(), u.id);
      const firstName = u.display_name.split(' ')[0].toLowerCase();
      if (!userMap.has(firstName)) userMap.set(firstName, u.id);
      userMap.set(u.short_code.toLowerCase(), u.id);
    });

    const now = new Date().toISOString();
    let success = 0;
    let failed = 0;
    const skipped: ImportError[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      setImportProgress({ current: i + 1, total: parsed.length });

      const deptId = row.department_name
        ? deptMap.get(row.department_name.toLowerCase()) || null
        : null;

      const assigneeId = row.assignee_name
        ? userMap.get(row.assignee_name.toLowerCase()) || null
        : null;

      // Build note with metadata that has no dedicated DB field
      const noteParts: string[] = [];
      if (row.description) noteParts.push(`Aktion: ${row.description}`);
      if (row.priority) noteParts.push(`Priorität: ${row.priority}`);
      if (row.original_nr) noteParts.push(`Original-Nr: ${row.original_nr}`);
      if (row.assignee_name && !assigneeId) noteParts.push(`Bearbeiter (CSV): ${row.assignee_name}`);
      if (row.note) noteParts.push(`---\n${row.note}`);
      const fullNote = noteParts.join('\n') || null;

      const insertData: Record<string, unknown> = {
        project_name: row.project_name,
        note: fullNote,
        status: row.status,
        department_id: deptId,
        assignee_id: assigneeId,
        client_name: row.client_name || row.assignee_name || null,
        customer_no: row.customer_no,
        product_code: row.product_code,
        internal_area_code: row.internal_area_code,
        project_article_no: row.project_article_no || row.original_nr,
        estimated_hours: row.estimated_hours,
        quantity: row.quantity,
        sop: row.sop,
        project_duration: row.project_duration,
        due_at: row.due_at,
        received_at: row.received_at,
        completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        created_by: user.id,
        last_changed_by: user.id,
        last_changed_at: now,
      };

      if (['in_arbeit', 'in_verzug', 'abgeschlossen', 'ready_for_review'].includes(row.status)) {
        insertData.started_at = row.received_at
          ? new Date(row.received_at).toISOString()
          : now;
      }

      if (row.status === 'abgeschlossen' && row.completed_at) {
        insertData.closed_at = new Date(row.completed_at).toISOString();
        insertData.closed_by = user.id;
      }

      const { error } = await supabase.from('cases').insert(insertData as any);
      if (error) {
        failed++;
        skipped.push({ line: i + 2, reason: error.message });
      } else {
        success++;
      }
    }

    setImporting(false);
    const finalResult = { success, failed, skipped: [...parseErrors, ...skipped] };
    setResult(finalResult);
    setShowResultDialog(true);

    if (failed === 0) toast.success(`${success} Vorgänge importiert`);
    else toast.error(`${success} importiert, ${failed} fehlgeschlagen`);
  };

  const reset = () => {
    setParsed(null);
    setParseErrors([]);
    setFileName('');
    setResult(null);
    setImportProgress({ current: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4 mt-3">
      <div className="rounded-md border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Vorgänge aus CSV importieren
          </h3>
          <p className="text-[11px] text-muted-foreground mb-1">
            Pflichtfeld: <span className="font-medium text-foreground">Titel (Projektname)</span>. 
            Alle anderen Spalten sind optional. Vorgangsnummer wird automatisch vergeben.
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Unterstützte Felder: Titel, Beschreibung, Abteilung, Bearbeiter, Auftraggeber, Kundennummer, 
            Produktcode, Bereich intern, Artikelnr., Status, Priorität, Geschätzte Stunden, Menge, SOP, 
            Projektlaufzeit, Fälligkeitsdatum, Eingangsdatum, Erledigt am, Notiz, Original-Nr
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-8 text-xs">
              <Upload className="h-3.5 w-3.5 mr-1.5" />Datei auswählen
            </Button>
            <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1.5" />Beispiel-CSV
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />{fileName}
              </span>
            )}
          </div>
        </div>

        {parseErrors.length > 0 && !result && (
          <div className="space-y-1">
            {parseErrors.map((err, i) => (
              <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Zeile {err.line}: {err.reason}
              </p>
            ))}
          </div>
        )}

        {parsed && parsed.length > 0 && !result && !importing && (
          <>
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Titel</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Abteilung</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bearbeiter</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kunde</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fällig</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 text-foreground max-w-[250px] truncate">{r.project_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.department_name || '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.assignee_name || '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.customer_no || '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{STATUS_LABELS[r.status] || r.status}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.due_at || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 50 && (
              <p className="text-[11px] text-muted-foreground">Vorschau: 50 von {parsed.length} Zeilen</p>
            )}
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={doImport} className="h-8 text-xs">
                {parsed.length} Vorgänge importieren
              </Button>
              <Button variant="outline" size="sm" onClick={reset} className="h-8 text-xs">Abbrechen</Button>
            </div>
          </>
        )}

        {importing && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              Importiere {importProgress.current} von {importProgress.total} Vorgängen…
            </span>
          </div>
        )}

        {result && !importing && (
          <div className="space-y-2">
            <p className="text-xs text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-done))]" />
              {result.success} Vorgänge erfolgreich importiert
              {result.failed > 0 && (
                <span className="text-destructive ml-2">{result.failed} fehlgeschlagen</span>
              )}
            </p>
            <div className="flex gap-2">
              {result.skipped.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowResultDialog(true)} className="h-8 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />Details anzeigen
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={reset} className="h-8 text-xs">
                Weiteren Import starten
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Import-Zusammenfassung</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-4">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-done))]" />
                  <span className="text-sm font-medium">{result.success} importiert</span>
                </div>
                {result.skipped.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">{result.skipped.length} Hinweise</span>
                  </div>
                )}
              </div>
              {result.skipped.length > 0 && (
                <ScrollArea className="max-h-60">
                  <div className="space-y-1">
                    {result.skipped.map((err, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-yellow-500" />
                        <span><span className="font-mono text-foreground">Zeile {err.line}:</span> {err.reason}</span>
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
