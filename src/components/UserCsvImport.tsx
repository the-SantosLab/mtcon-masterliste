import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

interface Dept { id: string; name: string; }
interface Row {
  first_name: string;
  last_name: string;
  email: string;
  department_name: string;
  status?: 'pending' | 'ok' | 'error';
  message?: string;
}

interface Props {
  departments: Dept[];
  defaultRole?: 'admin' | 'staff' | 'viewer';
  onDone: () => void;
}

const parseCsv = (text: string): Row[] => {
  const sep = text.includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',';
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(sep).map(h => h.trim());
  const idx = (k: string[]) => k.map(x => header.indexOf(x)).find(i => i >= 0) ?? -1;
  const iFirst = idx(['vorname', 'first_name', 'firstname']);
  const iLast = idx(['nachname', 'last_name', 'lastname']);
  const iEmail = idx(['email', 'e-mail', 'mail']);
  const iDept = idx(['abteilung', 'department', 'dept']);
  return lines.slice(1).map(line => {
    const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
    return {
      first_name: iFirst >= 0 ? parts[iFirst] || '' : '',
      last_name: iLast >= 0 ? parts[iLast] || '' : '',
      email: iEmail >= 0 ? parts[iEmail] || '' : '',
      department_name: iDept >= 0 ? parts[iDept] || '' : '',
    };
  }).filter(r => r.email);
};

export function UserCsvImport({ departments, defaultRole = 'staff', onDone }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [role, setRole] = useState<string>(defaultRole);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) { toast.error('Keine gültigen Zeilen gefunden'); return; }
    setRows(parsed);
    setDone(false);
  };

  const findDept = (name: string): string | null => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    const d = departments.find(x => x.name.toLowerCase() === n);
    return d?.id || null;
  };

  const startImport = async () => {
    setImporting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      next[i] = { ...r, status: 'pending' };
      setRows([...next]);

      const display = `${r.first_name} ${r.last_name}`.trim() || r.email;
      const short = (r.first_name?.[0] || '') + (r.last_name?.[0] || '') || r.email.split('@')[0].slice(0, 4).toUpperCase();
      const dept_id = findDept(r.department_name);

      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: r.email,
            display_name: display,
            short_code: short.toUpperCase().slice(0, 8),
            role,
            department_id: dept_id,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) next[i] = { ...next[i], status: 'error', message: body.error || `HTTP ${res.status}` };
        else next[i] = { ...next[i], status: 'ok' };
      } catch (e: any) {
        next[i] = { ...next[i], status: 'error', message: e?.message || 'Fehler' };
      }
      setRows([...next]);
    }
    setImporting(false);
    setDone(true);
    onDone();
  };

  const okCount = rows.filter(r => r.status === 'ok').length;
  const errCount = rows.filter(r => r.status === 'error').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importing}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />CSV auswählen
        </Button>
        <p className="text-[11px] text-muted-foreground">Spalten: Vorname, Nachname, Email, Abteilung · Komma oder Semikolon</p>
        {rows.length > 0 && !importing && (
          <Button variant="ghost" size="sm" onClick={() => { setRows([]); setDone(false); }}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Zurücksetzen
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Standard-Rolle für Import:</span>
            <Select value={role} onValueChange={setRole} disabled={importing}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Mitarbeiter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {rows.length} Zeile(n) · max. 50 Vorschau
            </span>
            <Button size="sm" onClick={startImport} disabled={importing || done}>
              {importing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Upload className="h-3.5 w-3.5 mr-1.5" />Importieren
            </Button>
          </div>

          <div className="rounded-md border border-border max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Vorname</th>
                  <th className="px-3 py-2 font-medium">Nachname</th>
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Abteilung</th>
                  <th className="px-3 py-2 font-medium w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{r.first_name}</td>
                    <td className="px-3 py-1.5">{r.last_name}</td>
                    <td className="px-3 py-1.5">{r.email}</td>
                    <td className="px-3 py-1.5">
                      {r.department_name}
                      {r.department_name && !findDept(r.department_name) && (
                        <span className="ml-1 text-destructive text-[10px]">(unbekannt)</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {r.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-[hsl(var(--status-done))]" />}
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

          {done && (
            <p className="text-xs text-muted-foreground">
              Fertig: <span className="text-[hsl(var(--status-done))]">{okCount} erstellt</span>
              {errCount > 0 && <span className="text-destructive"> · {errCount} fehlgeschlagen</span>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
