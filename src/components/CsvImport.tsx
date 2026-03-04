import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileText, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const EXPECTED_HEADERS = [
  'project_name', 'customer_no', 'client_name',
  'internal_area_code', 'product_code', 'project_article_no',
  'received_at', 'due_at', 'estimated_hours', 'note',
];

const SAMPLE_DATA = [
  {
    project_name: 'Website Redesign',
    customer_no: '10001',
    client_name: 'Max Müller',
    internal_area_code: '01',
    product_code: 'WEB',
    project_article_no: 'ART-2024-001',
    received_at: '2024-01-10',
    due_at: '2024-02-15',
    estimated_hours: '40',
    note: 'Responsive Design erforderlich',
  },
  {
    project_name: 'Mobile App Entwicklung',
    customer_no: '10002',
    client_name: 'Anna Schmidt',
    internal_area_code: '02',
    product_code: 'APP',
    project_article_no: 'ART-2024-002',
    received_at: '2024-01-15',
    due_at: '2024-03-30',
    estimated_hours: '120',
    note: 'iOS und Android Versionen',
  },
  {
    project_name: 'Datenbankoptimierung',
    customer_no: '10003',
    client_name: 'Peter Weber',
    internal_area_code: '03',
    product_code: 'DB',
    project_article_no: 'ART-2024-003',
    received_at: '2024-01-20',
    due_at: '2024-02-28',
    estimated_hours: '60',
    note: 'Performance-Tuning erforderlich',
  },
];

interface ParsedRow {
  project_name: string;
  customer_no: string | null;
  client_name: string | null;
  internal_area_code: string | null;
  product_code: string | null;
  project_article_no: string | null;
  received_at: string | null;
  due_at: string | null;
  estimated_hours: number | null;
  note: string | null;
}

function downloadSampleCSV() {
  const csv = [
    EXPECTED_HEADERS.join(','),
    ...SAMPLE_DATA.map(row => 
      EXPECTED_HEADERS.map(header => {
        const value = row[header as keyof typeof row];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value || '';
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'vorgaenge-beispiel.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success('Beispiel-CSV heruntergeladen');
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines.slice(1).map(line => line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, '')));
  return { headers, rows };
}

export function CsvImport() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErrors([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);

      const errs: string[] = [];
      const missing = ['project_name'].filter(h => !headers.includes(h));
      if (missing.length > 0) {
        errs.push(`Pflichtfelder fehlen: ${missing.join(', ')}`);
      }

      const unknown = headers.filter(h => !EXPECTED_HEADERS.includes(h));
      if (unknown.length > 0) {
        errs.push(`Unbekannte Spalten (werden ignoriert): ${unknown.join(', ')}`);
      }

      if (errs.length > 0 && missing.length > 0) {
        setErrors(errs);
        setParsed(null);
        return;
      }

      const colIndex = (name: string) => headers.indexOf(name);
      const get = (row: string[], name: string) => {
        const idx = colIndex(name);
        if (idx === -1) return '';
        return row[idx] || '';
      };

      const parsedRows: ParsedRow[] = [];
      const rowErrors: string[] = [...errs];

      rows.forEach((row, i) => {
        const projectName = get(row, 'project_name');
        if (!projectName) {
          rowErrors.push(`Zeile ${i + 2}: project_name fehlt`);
          return;
        }
        const hours = get(row, 'estimated_hours');
        parsedRows.push({
          project_name: projectName,
          customer_no: get(row, 'customer_no') || null,
          client_name: get(row, 'client_name') || null,
          internal_area_code: get(row, 'internal_area_code') || null,
          product_code: get(row, 'product_code') || null,
          project_article_no: get(row, 'project_article_no') || null,
          received_at: get(row, 'received_at') || null,
          due_at: get(row, 'due_at') || null,
          estimated_hours: hours ? Number(hours) : null,
          note: get(row, 'note') || null,
        });
      });

      setErrors(rowErrors);
      setParsed(parsedRows);
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!parsed || parsed.length === 0 || !user) return;
    setImporting(true);
    let success = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const row of parsed) {
      const { error } = await supabase.from('cases').insert({
        ...row,
        created_by: user.id,
        last_changed_by: user.id,
        last_changed_at: now,
      });
      if (error) {
        failed++;
      } else {
        success++;
      }
    }

    setImporting(false);
    setResult({ success, failed });
    if (failed === 0) {
      toast.success(`${success} Vorgänge importiert`);
    } else {
      toast.error(`${success} importiert, ${failed} fehlgeschlagen`);
    }
  };

  const reset = () => {
    setParsed(null);
    setErrors([]);
    setFileName('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4 mt-3">
      <div className="rounded-md border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CSV-Datei auswählen</h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Erwartete Spalten: project_name, customer_no, client_name, internal_area_code, product_code, project_article_no, received_at, due_at, estimated_hours, note
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Pflichtfeld: project_name. Vorgangsnummer wird automatisch vergeben. Trennzeichen: Komma oder Semikolon.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="hidden"
            />
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

        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{err}
              </p>
            ))}
          </div>
        )}

        {parsed && parsed.length > 0 && !result && (
          <>
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                     <th className="px-3 py-2 text-left font-medium text-muted-foreground">Projektname</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Kunde</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Endtermin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-mono">{r.case_no}</td>
                      <td className="px-3 py-2 text-foreground">{r.project_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.customer_no || '–'}</td>
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
              <Button size="sm" onClick={doImport} disabled={importing} className="h-8 text-xs">
                {importing ? 'Importieren…' : `${parsed.length} Vorgänge importieren`}
              </Button>
              <Button variant="outline" size="sm" onClick={reset} className="h-8 text-xs">Abbrechen</Button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-2">
            <p className="text-xs text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-done))]" />
              {result.success} Vorgänge erfolgreich importiert
              {result.failed > 0 && <span className="text-destructive ml-2">{result.failed} fehlgeschlagen</span>}
            </p>
            <Button variant="outline" size="sm" onClick={reset} className="h-8 text-xs">Weiteren Import starten</Button>
          </div>
        )}
      </div>
    </div>
  );
}
