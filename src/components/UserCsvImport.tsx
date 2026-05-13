import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Download, Info } from 'lucide-react';

interface Dept { id: string; name: string; }

interface Row {
  email: string;
  display_name: string;
  short_code?: string;
  department_name?: string;
  role?: 'admin' | 'staff' | 'viewer';
  manager_email?: string;
  is_manager?: boolean;
  active?: boolean;
  status?: 'pending' | 'created' | 'updated' | 'error' | 'skipped';
  message?: string;
}

interface Props {
  departments: Dept[];
  defaultRole?: 'admin' | 'staff' | 'viewer';
  onDone: () => void;
}

const TEMPLATE_HEADER = 'email;display_name;short_code;department_name;role;manager_email;is_manager;active';
const TEMPLATE_EXAMPLE = [
  'max.mueller@mtcon.de;Max Müller;MM;Engineering;staff;leitung@mtcon.de;false;true',
  'eva.schmidt@mtcon.de;Eva Schmidt;ES;Vertrieb;staff;leitung@mtcon.de;false;true',
  'leitung@mtcon.de;Klaus Leitung;KL;Geschäftsführung;admin;;true;true',
].join('\n');

const detectSep = (firstLine: string): string => {
  if (firstLine.includes(';')) return ';';
  if (firstLine.includes('\t')) return '\t';
  return ',';
};

const parseBool = (v: string | undefined): boolean | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const s = v.toLowerCase().trim();
  if (['true', '1', 'ja', 'yes', 'x'].includes(s)) return true;
  if (['false', '0', 'nein', 'no'].includes(s)) return false;
  return undefined;
};

const parseRole = (v: string | undefined): Row['role'] | undefined => {
  if (!v) return undefined;
  const s = v.toLowerCase().trim();
  if (s.startsWith('admin')) return 'admin';
  if (s.startsWith('view')) return 'viewer';
  if (['staff', 'mitarbeiter', 'mitarbeitende', 'user'].includes(s)) return 'staff';
  return undefined;
};

const parseCsv = (text: string): Row[] => {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const sep = detectSep(lines[0]);
  const header = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  const idx = (...keys: string[]) => {
    for (const k of keys) {
      const i = header.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iEmail = idx('email', 'e-mail', 'mail');
  const iDisplay = idx('display_name', 'name', 'vollständiger name', 'vollstaendiger name');
  const iFirst = idx('vorname', 'first_name', 'firstname', 'first name');
  const iLast = idx('nachname', 'last_name', 'lastname', 'last name');
  const iShort = idx('short_code', 'kürzel', 'kuerzel', 'kuerzel/initialen');
  const iDept = idx('department_name', 'abteilung', 'department', 'dept');
  const iRole = idx('role', 'rolle');
  const iManager = idx('manager_email', 'vorgesetzter_email', 'vorgesetzter', 'manager');
  const iIsManager = idx('is_manager', 'ist_manager', 'führungskraft', 'fuehrungskraft');
  const iActive = idx('active', 'aktiv', 'status');

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
    const email = iEmail >= 0 ? parts[iEmail] || '' : '';
    if (!email) continue;
    let display = iDisplay >= 0 ? parts[iDisplay] || '' : '';
    if (!display) {
      const fn = iFirst >= 0 ? parts[iFirst] || '' : '';
      const ln = iLast >= 0 ? parts[iLast] || '' : '';
      display = `${fn} ${ln}`.trim();
    }
    rows.push({
      email,
      display_name: display,
      short_code: iShort >= 0 ? parts[iShort] || undefined : undefined,
      department_name: iDept >= 0 ? parts[iDept] || undefined : undefined,
      role: iRole >= 0 ? parseRole(parts[iRole]) : undefined,
      manager_email: iManager >= 0 ? parts[iManager] || undefined : undefined,
      is_manager: iIsManager >= 0 ? parseBool(parts[iIsManager]) : undefined,
      active: iActive >= 0 ? parseBool(parts[iActive]) : undefined,
    });
  }
  return rows;
};

const downloadTemplate = () => {
  const blob = new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mitarbeiter-import-vorlage.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export function UserCsvImport({ departments, defaultRole = 'staff', onDone }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [role, setRole] = useState<string>(defaultRole);
  const [sendInvite, setSendInvite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) { toast.error('Keine gültigen Zeilen gefunden'); return; }
    setRows(parsed);
    setDone(false);
    setSummary(null);
  };

  const findDept = (name?: string): string | null => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    return departments.find(x => x.name.toLowerCase() === n)?.id || null;
  };

  const startImport = async () => {
    setImporting(true);
    setRows(prev => prev.map(r => ({ ...r, status: 'pending' as const })));

    try {
      const { data, error } = await supabase.functions.invoke('bulk-import-users', {
        body: {
          rows: rows.map(r => ({
            email: r.email,
            display_name: r.display_name,
            short_code: r.short_code,
            department_name: r.department_name,
            role: r.role,
            manager_email: r.manager_email,
            is_manager: r.is_manager,
            active: r.active,
          })),
          default_role: role,
          send_invite: sendInvite,
        },
      });
      if (error) throw error;

      const resultMap = new Map<string, { status: Row['status']; message?: string }>(
        (data.results || []).map((res: any) => [String(res.email).toLowerCase(), {
          status: res.status === 'created' || res.status === 'updated' ? res.status : 'error',
          message: res.message,
        }])
      );

      setRows(prev => prev.map(r => {
        const m = resultMap.get(r.email.toLowerCase());
        return m ? { ...r, status: m.status, message: m.message } : { ...r, status: 'error', message: 'Kein Ergebnis' };
      }));
      setSummary(data.summary);
      toast.success(`Import abgeschlossen: ${data.summary.created} neu, ${data.summary.updated} aktualisiert, ${data.summary.errors} Fehler`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      toast.error(`Import fehlgeschlagen: ${msg}`);
      setRows(prev => prev.map(r => ({ ...r, status: 'error', message: msg })));
    } finally {
      setImporting(false);
      setDone(true);
      onDone();
    }
  };

  const okCount = rows.filter(r => r.status === 'created' || r.status === 'updated').length;
  const errCount = rows.filter(r => r.status === 'error').length;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1.5">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-foreground font-medium text-xs">Personio-Übergangslösung</p>
            <p>Spalten (Komma, Semikolon oder Tab): <code className="text-[10px]">email, display_name, short_code, department_name, role, manager_email, is_manager, active</code></p>
            <p>Pflichtfeld: <code className="text-[10px]">email</code>. Fehlende Felder werden mit Defaults befüllt. Bestehende E-Mails werden aktualisiert (kein Duplikat). Manager-Verknüpfung erfolgt im 2. Pass über <code className="text-[10px]">manager_email</code>.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,.txt"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importing} className="h-8 text-xs">
          <FileText className="h-3.5 w-3.5 mr-1.5" />CSV auswählen
        </Button>
        <Button variant="ghost" size="sm" onClick={downloadTemplate} disabled={importing} className="h-8 text-xs">
          <Download className="h-3.5 w-3.5 mr-1.5" />Vorlage herunterladen
        </Button>
        {rows.length > 0 && !importing && (
          <Button variant="ghost" size="sm" onClick={() => { setRows([]); setDone(false); setSummary(null); }} className="h-8 text-xs">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Zurücksetzen
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">Standard-Rolle:</span>
            <Select value={role} onValueChange={setRole} disabled={importing}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Mitarbeiter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={sendInvite} onCheckedChange={(v) => setSendInvite(v === true)} disabled={importing} />
              Passwort-Reset-Mail an neue Nutzer
            </label>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {rows.length} Zeile(n) · max. 50 Vorschau
            </span>
            <Button size="sm" onClick={startImport} disabled={importing || done} className="h-8 text-xs">
              {importing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Upload className="h-3.5 w-3.5 mr-1.5" />Importieren
            </Button>
          </div>

          <div className="rounded-md border border-border max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Kürzel</th>
                  <th className="px-3 py-2 font-medium">Abteilung</th>
                  <th className="px-3 py-2 font-medium">Rolle</th>
                  <th className="px-3 py-2 font-medium">Manager</th>
                  <th className="px-3 py-2 font-medium w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{r.email}</td>
                    <td className="px-3 py-1.5">{r.display_name || <span className="text-muted-foreground">–</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{r.short_code || <span className="text-muted-foreground">auto</span>}</td>
                    <td className="px-3 py-1.5">
                      {r.department_name || <span className="text-muted-foreground">–</span>}
                      {r.department_name && !findDept(r.department_name) && (
                        <span className="ml-1 text-destructive text-[10px]">(unbekannt)</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{r.role || <span className="text-muted-foreground">{role}</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{r.manager_email || <span className="text-muted-foreground">–</span>}</td>
                    <td className="px-3 py-1.5">
                      {r.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {r.status === 'created' && (
                        <span className="inline-flex items-center gap-1 text-[hsl(var(--status-done))]">
                          <CheckCircle2 className="h-3 w-3" />neu
                        </span>
                      )}
                      {r.status === 'updated' && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3" />aktualisiert
                        </span>
                      )}
                      {r.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          <span title={r.message} className="truncate max-w-[120px]">{r.message}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {done && summary && (
            <p className="text-xs text-muted-foreground">
              Fertig: <span className="text-[hsl(var(--status-done))]">{summary.created} neu</span>
              {' · '}<span>{summary.updated} aktualisiert</span>
              {summary.errors > 0 && <span className="text-destructive"> · {summary.errors} fehlgeschlagen</span>}
              {rows.length > 50 && <span className="ml-2">({rows.length - 50} weitere Zeilen verarbeitet, nur 50 angezeigt)</span>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
