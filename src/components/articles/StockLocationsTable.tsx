import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Trash2, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

export type StockLocation = {
  id: string;
  art_nr: string;
  lager: string;
  lagerpl: string;
  behaelter: string;
  charge_nr: string;
  charge_ext: string | null;
  bestand: number;
  sb_menge: number;
  mb_menge: number;
  verp_mg: number | null;
  me: string | null;
  datum_zu: string | null;
  datum_abg: string | null;
  best_inv: number | null;
  datum_inv: string | null;
  fuellgrad_pct: number | null;
  aend_ind: string | null;
  aend_dat: string | null;
  source: string;
};

interface Props {
  artNr?: string;                 // optional filter to single article
  showSummary?: boolean;          // KPI tiles row (only useful per-article)
  globalSearchableArtNr?: boolean; // top-level mode: allow searching across art_nr too
}

export function StockLocationsTable({ artNr, showSummary = true, globalSearchableArtNr = false }: Props) {
  const { isAdmin } = useAuth();
  const { preferences } = usePreferences();
  const compact = preferences.compactTables;

  const [rows, setRows] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterLager, setFilterLager] = useState<string>('');
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [edit, setEdit] = useState<StockLocation | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    let query: any = (supabase as any)
      .from('article_stock_locations')
      .select('*')
      .order('art_nr', { ascending: true })
      .order('lager', { ascending: true })
      .order('lagerpl', { ascending: true })
      .limit(globalSearchableArtNr ? 1000 : 5000);
    if (artNr) query = query.eq('art_nr', artNr);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data as StockLocation[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [artNr]);

  const lagerOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.lager))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filterLager && r.lager !== filterLager) return false;
      if (onlyPositive && (Number(r.bestand) || 0) <= 0) return false;
      if (!t) return true;
      const cols: (keyof StockLocation)[] = ['art_nr','lager','lagerpl','behaelter','charge_nr','charge_ext'];
      return cols.some(c => String(r[c] ?? '').toLowerCase().includes(t));
    });
  }, [rows, q, filterLager, onlyPositive]);

  const summary = useMemo(() => {
    const all = rows.reduce((s, r) => s + Number(r.bestand || 0), 0);
    const blocked = rows.reduce((s, r) => s + Number(r.sb_menge || 0), 0);
    const nonDispo = rows
      .filter(r => /KL|MA|ALT|MESSE|DANNY|IGOR|BSW/i.test(r.lager))
      .reduce((s, r) => s + Number(r.bestand || 0), 0);
    return { all, blocked, nonDispo };
  }, [rows]);

  const remove = async (row: StockLocation) => {
    if (!confirm(`Eintrag löschen?\n\n${row.art_nr} · ${row.lager}/${row.lagerpl}/${row.behaelter}${row.charge_nr ? ' · Charge ' + row.charge_nr : ''}`)) return;
    const { error } = await (supabase as any).from('article_stock_locations').delete().eq('id', row.id);
    if (error) return toast.error(error.message);
    toast.success('Gelöscht');
    fetchRows();
  };

  const num = (n: number | null | undefined, digits = 0) =>
    n == null ? '—' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div className="space-y-3">
      {showSummary && artNr && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryTile label="Bestand alle Lager" value={num(summary.all)} unit={rows[0]?.me ?? ''} />
          <SummaryTile label="davon gesperrt" value={num(summary.blocked)} unit={rows[0]?.me ?? ''} tone="warn" />
          <SummaryTile label="nicht disponibel" value={num(summary.nonDispo)} unit={rows[0]?.me ?? ''} tone="mute" />
          <SummaryTile label="Lagerorte" value={String(rows.length)} unit="Zeilen" tone="info" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder={globalSearchableArtNr ? 'Art.-Nr, Lager, Platz, Charge …' : 'Lager, Platz, Charge, Behälter …'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-xs pl-8"
          />
        </div>
        {lagerOptions.length > 1 && (
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={filterLager}
              onChange={(e) => setFilterLager(e.target.value)}
              className="h-8 rounded-md border border-input bg-background text-xs px-2"
            >
              <option value="">Alle Lager</option>
              {lagerOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyPositive}
            onChange={(e) => setOnlyPositive(e.target.checked)}
            className="h-3 w-3"
          />
          nur Bestand &gt; 0
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">{filtered.length} / {rows.length}</span>
          {isAdmin && artNr && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(true)}>
              <Plus className="h-3 w-3 mr-1" />Neu
            </Button>
          )}
        </div>
      </div>

      <div className="md:hidden space-y-2">
        {loading && (
          <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">Lade…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">Keine Einträge</div>
        )}
        {!loading && filtered.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-card px-3 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground">{globalSearchableArtNr ? 'Art.-Nr' : 'Lager'}</div>
                <div className="mt-0.5 break-words font-mono text-sm font-semibold text-foreground">{globalSearchableArtNr ? r.art_nr : r.lager}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">Bestand</div>
                <div className={`mt-0.5 text-sm font-semibold tabular-nums ${Number(r.bestand) > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {num(r.bestand)} <span className="text-[10px] font-normal text-muted-foreground">{r.me ?? ''}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {globalSearchableArtNr && <MobileField label="Lager" value={r.lager} mono />}
              <MobileField label="Lagerplatz" value={r.lagerpl || '—'} />
              <MobileField label="Behälter" value={r.behaelter || '—'} />
              <MobileField label="SB" value={num(r.sb_menge)} />
              <MobileField label="MB" value={num(r.mb_menge)} />
              <MobileField label="Charge-Nr" value={r.charge_nr || '—'} mono />
              <MobileField label="Charge-Ext" value={r.charge_ext || '—'} mono />
              <MobileField label="Datum-Zu" value={r.datum_zu || '—'} />
              <MobileField label="Best-Inv" value={num(r.best_inv)} />
              <MobileField label="Füllgrad" value={r.fuellgrad_pct != null ? num(r.fuellgrad_pct, 1) + '%' : '—'} />
            </div>
            {(isAdmin && artNr) && (
              <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-2">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEdit(r)}><Pencil className="h-3 w-3 mr-1" />Bearbeiten</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => remove(r)}><Trash2 className="h-3 w-3 mr-1" />Löschen</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block rounded-md border border-border bg-card overflow-auto max-h-[60vh]">
        <table className={`w-full caption-bottom text-sm ${compact ? 'table-compact' : ''}`}>
          <thead>
            <tr className="border-b">
              {(globalSearchableArtNr ? ['Art.-Nr'] : []).concat([
                'Lager','Lagerpl.','Behälter','Bestand','ME','SB','MB','Charge-Nr','Charge-Ext','Datum-Zu','Best-Inv','Datum-Inv','Füllgr','Quelle',''
              ]).map((h, i) => (
                <th key={i} className={`sticky top-0 z-10 text-left bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border))] font-medium text-muted-foreground ${compact ? 'text-[10px] px-2 py-1' : 'text-[10px] px-3 py-2'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={20} className="text-xs text-center text-muted-foreground py-6">Lade…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={20} className="text-xs text-center text-muted-foreground py-6">Keine Einträge</td></tr>
            )}
            {!loading && filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                {globalSearchableArtNr && <td className={`font-mono ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.art_nr}</td>}
                <td className={`font-mono ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.lager}</td>
                <td className={compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}>{r.lagerpl || '—'}</td>
                <td className={compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}>{r.behaelter || '—'}</td>
                <td className={`tabular-nums text-right ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'} ${Number(r.bestand) > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{num(r.bestand)}</td>
                <td className={compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}>{r.me ?? '—'}</td>
                <td className={`tabular-nums text-right ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'} ${Number(r.sb_menge) > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>{num(r.sb_menge)}</td>
                <td className={`tabular-nums text-right ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'} text-muted-foreground`}>{num(r.mb_menge)}</td>
                <td className={`font-mono ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.charge_nr || '—'}</td>
                <td className={`font-mono ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.charge_ext || '—'}</td>
                <td className={`tabular-nums ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.datum_zu || '—'}</td>
                <td className={`tabular-nums text-right ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{num(r.best_inv)}</td>
                <td className={`tabular-nums ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.datum_inv || '—'}</td>
                <td className={`tabular-nums text-right ${compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}>{r.fuellgrad_pct != null ? num(r.fuellgrad_pct, 1) + '%' : '—'}</td>
                <td className={compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}>
                  <Badge variant={r.source === 'ISSOS' ? 'secondary' : 'outline'} className="text-[9px] h-4 px-1.5">{r.source}</Badge>
                </td>
                <td className={compact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}>
                  {isAdmin && (
                    <div className="flex items-center gap-1 justify-end">
                      <button className="text-muted-foreground hover:text-foreground" onClick={() => setEdit(r)} title="Bearbeiten"><Pencil className="h-3 w-3" /></button>
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => remove(r)} title="Löschen"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(edit || creating) && (
        <EditDialog
          row={edit}
          artNr={artNr}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); fetchRows(); }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'warn' | 'mute' | 'info' }) {
  const toneCls =
    tone === 'warn' ? 'text-amber-500'
    : tone === 'mute' ? 'text-muted-foreground'
    : tone === 'info' ? 'text-primary'
    : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums leading-tight ${toneCls}`}>
        {value} {unit && <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function MobileField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 border-t border-border/60 pt-2">
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
      <div className={`mt-0.5 break-words text-xs leading-snug text-foreground ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

const FIELDS: { key: keyof StockLocation; label: string; type?: 'text' | 'number' | 'date' }[] = [
  { key: 'lager', label: 'Lager' },
  { key: 'lagerpl', label: 'Lagerplatz' },
  { key: 'behaelter', label: 'Behälter' },
  { key: 'charge_nr', label: 'Charge-Nr' },
  { key: 'charge_ext', label: 'Charge-Ext' },
  { key: 'bestand', label: 'Bestand', type: 'number' },
  { key: 'sb_menge', label: 'SB-Menge', type: 'number' },
  { key: 'mb_menge', label: 'MB-Menge', type: 'number' },
  { key: 'verp_mg', label: 'Verp.-Menge', type: 'number' },
  { key: 'me', label: 'ME' },
  { key: 'datum_zu', label: 'Datum-Zu', type: 'date' },
  { key: 'datum_abg', label: 'Datum-Abg.', type: 'date' },
  { key: 'best_inv', label: 'Best-Inv', type: 'number' },
  { key: 'datum_inv', label: 'Datum-Inv', type: 'date' },
  { key: 'fuellgrad_pct', label: 'Füllgrad %', type: 'number' },
  { key: 'aend_ind', label: 'Änd-Ind' },
  { key: 'aend_dat', label: 'Änd-Dat', type: 'date' },
];

function EditDialog({ row, artNr, onClose, onSaved }:
  { row: StockLocation | null; artNr?: string; onClose: () => void; onSaved: () => void }
) {
  const isNew = !row;
  const [form, setForm] = useState<any>(() => {
    if (row) return { ...row };
    return { art_nr: artNr ?? '', lager: '', lagerpl: '', behaelter: '', charge_nr: '', bestand: 0, sb_menge: 0, mb_menge: 0, source: 'MANUAL' };
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.art_nr || !form.lager) {
      toast.error('Art.-Nr und Lager sind Pflichtfelder');
      return;
    }
    setSaving(true);
    const payload: any = { ...form, source: form.source ?? 'MANUAL' };
    // Coerce empty strings to null and parse numbers
    for (const f of FIELDS) {
      const v = payload[f.key];
      if (f.type === 'number') payload[f.key] = v === '' || v == null ? null : Number(v);
      else if (v === '') payload[f.key] = null;
    }
    let error: any;
    if (isNew) {
      ({ error } = await (supabase as any).from('article_stock_locations').insert(payload));
    } else {
      const { id, art_nr: _ignore, ...patch } = payload;
      ({ error } = await (supabase as any).from('article_stock_locations').update(patch).eq('id', row!.id));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? 'Angelegt' : 'Gespeichert');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isNew ? 'Neuer Lagerort' : 'Lagerort bearbeiten'}
            <span className="ml-2 font-mono text-muted-foreground text-xs">{form.art_nr}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {!artNr && isNew && (
            <Field label="Art.-Nr" value={form.art_nr} onChange={(v) => setForm((f: any) => ({ ...f, art_nr: v }))} mono required />
          )}
          {FIELDS.map((f) => (
            <Field
              key={f.key as string}
              label={f.label}
              type={f.type}
              value={form[f.key] ?? ''}
              onChange={(v) => setForm((s: any) => ({ ...s, [f.key]: v }))}
              required={f.key === 'lager'}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type, required, mono }:
  { label: string; value: any; onChange: (v: string) => void; type?: 'text' | 'number' | 'date'; required?: boolean; mono?: boolean }
) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-destructive">*</span>}
      </span>
      <Input
        type={type ?? 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 text-xs ${mono ? 'font-mono' : ''}`}
      />
    </label>
  );
}
