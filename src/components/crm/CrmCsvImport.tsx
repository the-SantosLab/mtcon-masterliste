import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, Download, Loader2, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_ROWS = 500;
const MAX_BYTES = 5 * 1024 * 1024;

export type CrmImportField = {
  /** DB column name */
  key: string;
  /** Human label in mapping dropdown */
  label: string;
  required?: boolean;
  /** Optional value normalizer (e.g. enum mapping) */
  transform?: (raw: string) => any;
  /** Synonyms used for auto-detect from CSV header */
  aliases?: string[];
};

export type CrmImportConfig = {
  title: string;
  table: 'companies' | 'contacts';
  fields: CrmImportField[];
  templateFilename: string;
  /** CSV header row in exact desired order */
  templateHeaders: string[];
  /** One example row */
  templateExample: string[];
  /** Optional pre-insert hook: lets caller mutate row, return null to skip */
  rowAdapter?: (row: Record<string, any>, ctx: { companiesByName?: Map<string, string> }) => Promise<Record<string, any> | { skipReason: string } | null>;
  /** Field used for duplicate-by-name detection (e.g. 'name') — if undefined, no duplicate toggle */
  dupKey?: string;
  /** Build context (used to preload e.g. companies map for contact import) */
  buildContext?: () => Promise<{ companiesByName?: Map<string, string> }>;
  /** Extra summary text after import */
  extraSummary?: (rows: any[]) => string | null;
};

type Props = { open: boolean; onClose: () => void; onDone: () => void; config: CrmImportConfig };

const SKIP = '__skip__';

export function CrmCsvImport({ open, onClose, onDone, config }: Props) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // csvHeader -> dbField | __skip__
  const [skipDup, setSkipDup] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number; extra?: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1); setFile(null); setHeaders([]); setRows([]); setMapping({});
    setSkipDup(true); setImporting(false); setProgress(0); setResult(null);
  };
  const close = () => { reset(); onClose(); };

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) { toast.error('Nur .csv Dateien erlaubt'); return; }
    if (f.size > MAX_BYTES) { toast.error('Datei zu groß (max 5MB)'); return; }
    setFile(f);
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res: any) => {
        const data = (res.data ?? []) as Record<string, string>[];
        if (data.length === 0) { toast.error('CSV enthält keine Daten'); return; }
        if (data.length > MAX_ROWS) { toast.error(`Bitte maximal ${MAX_ROWS} Einträge pro Import. Teile die Datei auf.`); return; }
        const hdrs = res.meta?.fields ?? [];
        setHeaders(hdrs);
        setRows(data);
        // Auto-map by exact / alias match
        const auto: Record<string, string> = {};
        for (const h of hdrs) {
          const norm = h.toLowerCase().trim();
          const m = config.fields.find(f =>
            f.key.toLowerCase() === norm ||
            f.label.toLowerCase() === norm ||
            (f.aliases ?? []).some(a => a.toLowerCase() === norm)
          );
          auto[h] = m ? m.key : SKIP;
        }
        setMapping(auto);
        setStep(2);
      },
      error: (err: any) => { toast.error('CSV konnte nicht gelesen werden: ' + err.message); },
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse({ fields: config.templateHeaders, data: [config.templateExample] });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = config.templateFilename;
    a.click(); URL.revokeObjectURL(url);
  };

  const mappedFields = useMemo(() => Object.values(mapping).filter(v => v !== SKIP), [mapping]);
  const requiredOk = config.fields.filter(f => f.required).every(f => mappedFields.includes(f.key));

  const runImport = async () => {
    setImporting(true); setProgress(5);
    try {
      const ctx = config.buildContext ? await config.buildContext() : {};
      setProgress(15);

      // Existing duplicates
      let existingNames = new Set<string>();
      if (skipDup && config.dupKey) {
        const dupCsvCol = Object.entries(mapping).find(([, v]) => v === config.dupKey)?.[0];
        if (dupCsvCol) {
          const { data } = await supabase.from(config.table).select(config.dupKey);
          existingNames = new Set((data ?? []).map((r: any) => String(r[config.dupKey!] ?? '').toLowerCase().trim()));
        }
      }

      const payloads: any[] = [];
      let skipped = 0;
      const skipReasons: Record<string, number> = {};

      for (const row of rows) {
        const obj: Record<string, any> = {};
        for (const [csvCol, dbField] of Object.entries(mapping)) {
          if (dbField === SKIP) continue;
          const raw = (row[csvCol] ?? '').trim();
          if (!raw) continue;
          const fieldDef = config.fields.find(f => f.key === dbField);
          obj[dbField] = fieldDef?.transform ? fieldDef.transform(raw) : raw;
        }

        // Required check
        if (config.fields.some(f => f.required && (obj[f.key] === undefined || obj[f.key] === ''))) {
          skipped++; skipReasons['Pflichtfeld fehlt'] = (skipReasons['Pflichtfeld fehlt'] ?? 0) + 1; continue;
        }

        // Dup check
        if (skipDup && config.dupKey && obj[config.dupKey]) {
          const k = String(obj[config.dupKey]).toLowerCase().trim();
          if (existingNames.has(k)) { skipped++; continue; }
          existingNames.add(k);
        }

        // Adapter (e.g. company_name lookup)
        let final: any = obj;
        if (config.rowAdapter) {
          const r = await config.rowAdapter(obj, ctx);
          if (r === null) { skipped++; continue; }
          if ((r as any).skipReason) {
            skipped++; const reason = (r as any).skipReason;
            skipReasons[reason] = (skipReasons[reason] ?? 0) + 1; continue;
          }
          final = r;
        }
        payloads.push(final);
      }

      setProgress(40);

      // Bulk insert in chunks of 100
      let imported = 0;
      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { error } = await supabase.from(config.table).insert(chunk as any);
        if (error) { toast.error('Import-Fehler: ' + error.message); setImporting(false); return; }
        imported += chunk.length;
        setProgress(40 + Math.round(((i + chunk.length) / Math.max(payloads.length, 1)) * 55));
      }

      setProgress(100);
      const extra = config.extraSummary ? config.extraSummary(payloads) : null;
      // Append context-specific reason summary
      const reasonText = Object.entries(skipReasons).map(([k, v]) => `${v}× ${k}`).join(', ');
      setResult({ imported, skipped, extra: [extra, reasonText].filter(Boolean).join(' · ') || null });
      setStep(3);
    } finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{config.title}</DialogTitle></DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider">
          {['Upload', 'Mappen', 'Bestätigen'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn('w-5 h-5 rounded-full grid place-items-center text-[10px] font-semibold',
                step > i + 1 ? 'bg-emerald-500/20 text-emerald-400'
                : step === i + 1 ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground')}>{i + 1}</div>
              <span className={cn(step === i + 1 ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
              {i < 2 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition"
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-foreground">CSV-Datei hierher ziehen oder klicken</p>
              <p className="text-[10px] text-muted-foreground mt-1">Max 5 MB · max {MAX_ROWS} Zeilen</p>
            </div>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button onClick={downloadTemplate} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto">
              <Download className="h-3 w-3" /> Vorlage herunterladen
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> {file?.name} · {rows.length} Zeilen
              <button onClick={() => { reset(); }} className="ml-auto hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>

            <div className="rounded border border-border max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5 font-normal">CSV-Spalte</th>
                    <th className="px-2 py-1.5 font-normal">→ Datenbankfeld</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map(h => (
                    <tr key={h} className="border-t border-border">
                      <td className="px-2 py-1.5 text-foreground">{h}</td>
                      <td className="px-2 py-1.5">
                        <Select value={mapping[h] ?? SKIP} onValueChange={v => setMapping({ ...mapping, [h]: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP}>— Nicht importieren —</SelectItem>
                            {config.fields.map(f => (
                              <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-[10px] uppercase text-muted-foreground mb-1.5">Vorschau (erste 3 Zeilen)</p>
              <div className="rounded border border-border overflow-auto max-h-40">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40">
                    <tr>{headers.map(h => <th key={h} className="px-2 py-1 text-left font-normal text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {headers.map(h => <td key={h} className="px-2 py-1 text-foreground">{r[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!requiredOk && <p className="text-[11px] text-destructive">Pflichtfeld noch nicht gemappt.</p>}

            <DialogFooter>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStep(1)}>Zurück</Button>
              <Button size="sm" className="h-8 text-xs" disabled={!requiredOk} onClick={() => setStep(3)}>Weiter</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {!result ? (
              <>
                <p className="text-xs text-foreground"><strong className="tabular-nums">{rows.length}</strong> Einträge werden importiert.</p>
                {config.dupKey && (
                  <div className="flex items-center gap-2">
                    <Switch checked={skipDup} onCheckedChange={setSkipDup} />
                    <Label className="text-xs cursor-pointer" onClick={() => setSkipDup(!skipDup)}>
                      Bestehende Einträge mit gleichem {config.fields.find(f => f.key === config.dupKey)?.label ?? 'Wert'} überspringen
                    </Label>
                  </div>
                )}
                {importing && <Progress value={progress} className="h-1.5" />}
                <DialogFooter>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setStep(2)} disabled={importing}>Zurück</Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={runImport} disabled={importing}>
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Importieren
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="rounded border border-border bg-muted/20 p-4 space-y-1.5">
                  <p className="text-sm text-foreground"><strong className="tabular-nums">{result.imported}</strong> erfolgreich importiert</p>
                  {result.skipped > 0 && <p className="text-xs text-muted-foreground"><strong className="tabular-nums">{result.skipped}</strong> übersprungen</p>}
                  {result.extra && <p className="text-[11px] text-muted-foreground">{result.extra}</p>}
                </div>
                <DialogFooter>
                  <Button size="sm" className="h-8 text-xs" onClick={() => { onDone(); close(); }}>Schließen</Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
