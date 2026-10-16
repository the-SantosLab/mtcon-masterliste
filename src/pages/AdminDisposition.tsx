import { FulfillmentHeader, FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ShoppingCart, AlertTriangle, TrendingDown, Package, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Row = {
  art_nr: string;
  bezeich_1: string | null;
  me: string | null;
  on_hand: number;
  reserved: number;
  open_demand: number;
  open_supply: number;
  reorder_point: number;
  net_available: number;
  shortage: number;
  suggested_qty: number;
  primary_lief_nr: string | null;
  primary_supplier_name: string | null;
  primary_price: number | null;
  primary_lieferzeit: number | null;
  second_lief_nr: string | null;
  second_supplier_name: string | null;
  second_price: number | null;
  second_lieferzeit: number | null;
  best_lief_nr: string | null;
  best_supplier_name: string | null;
  best_price: number | null;
  savings: number;
};

type SourceChoice = 'primary' | 'second' | 'best';

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtEUR = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export default function AdminDisposition() {
  const { isAdmin, loading, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'shortage' | 'all'>('shortage');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceChoice, setSourceChoice] = useState<Record<string, SourceChoice>>({});
  const [overrideQty, setOverrideQty] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);

  const canUse = isAdmin || role === 'staff';

  const load = async () => {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc('get_disposition_overview');
    setBusy(false);
    if (error) { toast.error('Laden fehlgeschlagen'); console.error(error); return; }
    // Ohne Meldebestand liefert die DB Vorschlag 0 – dann mindestens die Unterdeckung vorschlagen
    setRows(((data || []) as Row[]).map(r => ({
      ...r,
      suggested_qty: Number(r.suggested_qty) > 0 ? Number(r.suggested_qty) : Math.ceil(Number(r.shortage) || 0),
    })));
  };

  useEffect(() => { if (canUse) load(); }, [canUse]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter(r => filter === 'all' ? true : r.shortage > 0)
      .filter(r => !s
        || r.art_nr.toLowerCase().includes(s)
        || (r.bezeich_1 || '').toLowerCase().includes(s)
        || (r.primary_supplier_name || '').toLowerCase().includes(s)
        || (r.second_supplier_name || '').toLowerCase().includes(s))
      .sort((a, b) => b.shortage - a.shortage);
  }, [rows, search, filter]);

  const kpi = useMemo(() => {
    const need = rows.filter(r => r.shortage > 0);
    const noSupplier = need.filter(r => !r.primary_lief_nr).length;
    const totalValue = need.reduce((s, r) => s + (r.suggested_qty * (r.best_price ?? r.primary_price ?? 0)), 0);
    const totalSavings = need.reduce((s, r) => s + (r.savings || 0) * r.suggested_qty, 0);
    return { needCount: need.length, noSupplier, totalValue, totalSavings };
  }, [rows]);

  const chosenFor = (r: Row): { lief_nr: string | null; name: string | null; price: number | null; lz: number | null } => {
    const choice = sourceChoice[r.art_nr] ?? 'best';
    if (choice === 'primary') return { lief_nr: r.primary_lief_nr, name: r.primary_supplier_name, price: r.primary_price, lz: r.primary_lieferzeit };
    if (choice === 'second')  return { lief_nr: r.second_lief_nr,  name: r.second_supplier_name,  price: r.second_price,  lz: r.second_lieferzeit };
    return { lief_nr: r.best_lief_nr, name: r.best_supplier_name, price: r.best_price, lz: null };
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected(new Set()); return; }
    setSelected(new Set(filtered.filter(r => r.shortage > 0 && r.primary_lief_nr).map(r => r.art_nr)));
  };

  const createPOs = async () => {
    if (selected.size === 0) { toast.error('Keine Artikel ausgewählt'); return; }
    setCreating(true);
    // Group by chosen supplier
    const groups = new Map<string, { name: string | null; items: { art_nr: string; description: string; qty: number; unit_price: number | null }[] }>();
    for (const r of rows) {
      if (!selected.has(r.art_nr)) continue;
      const c = chosenFor(r);
      if (!c.lief_nr) continue;
      const qty = overrideQty[r.art_nr] ?? r.suggested_qty;
      if (qty <= 0) continue;
      const g = groups.get(c.lief_nr) ?? { name: c.name, items: [] };
      g.items.push({ art_nr: r.art_nr, description: r.bezeich_1 || r.art_nr, qty, unit_price: c.price });
      groups.set(c.lief_nr, g);
    }
    if (groups.size === 0) { setCreating(false); toast.error('Keine gültigen Positionen'); return; }

    let ok = 0, fail = 0;
    for (const [lief_nr, g] of groups) {
      const { error } = await (supabase as any).rpc('create_po_from_suggestions', {
        _supplier_lief_nr: lief_nr,
        _supplier_name: g.name,
        _items: g.items,
      });
      if (error) { fail++; console.error(lief_nr, error); } else { ok++; }
    }
    setCreating(false);
    if (ok > 0) toast.success(`${ok} Bestellung(en) als Entwurf erstellt`);
    if (fail > 0) toast.error(`${fail} Bestellung(en) fehlgeschlagen`);
    setSelected(new Set());
    load();
  };

  if (loading) return <AppLayout><div className="p-6">Laden…</div></AppLayout>;
  if (!canUse) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="fulfillment-page">
        <FulfillmentHeader title="Disposition" subtitle="Bestände · Materialbedarf · Bestellvorschläge" actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={busy}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', busy && 'animate-spin')} /> Aktualisieren
            </Button>
            <Button size="sm" onClick={createPOs} disabled={creating || selected.size === 0}>
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              Bestellungen erstellen ({selected.size})
            </Button>
          </div>
        } />

        <FulfillmentMetrics loading={busy} metrics={[
          { label: 'Artikel unter Meldebestand', value: fmt(kpi.needCount), tone: 'overdue' },
          { label: 'Ohne Lieferant', value: fmt(kpi.noSupplier) },
          { label: 'Bestellvolumen (best.)', value: fmtEUR(kpi.totalValue) },
          { label: 'Ersparnis 2nd-Source', value: fmtEUR(kpi.totalSavings), tone: 'done' },
        ]} />

        <div className="fulfillment-toolbar">
          <Input
            placeholder="Suche Art-Nr, Bezeichnung, Lieferant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-sm text-xs"
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="shortage">Nur Unterdeckung</SelectItem>
              <SelectItem value="all">Alle Artikel</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} Zeilen</span>
        </div>

        <Card className="fulfillment-table">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 w-8 text-left">
                    <Checkbox
                      checked={selected.size > 0 && filtered.filter(r => r.shortage > 0 && r.primary_lief_nr).every(r => selected.has(r.art_nr))}
                      onCheckedChange={(v) => toggleAll(v === true)}
                    />
                  </th>
                  <th className="px-2 py-2 text-left">Artikel</th>
                  <th className="px-2 py-2 text-right">Bestand</th>
                  <th className="px-2 py-2 text-right">Reserv.</th>
                  <th className="px-2 py-2 text-right">Bedarf</th>
                  <th className="px-2 py-2 text-right">Zugang</th>
                  <th className="px-2 py-2 text-right">Verfügbar</th>
                  <th className="px-2 py-2 text-right">Meldebest.</th>
                  <th className="px-2 py-2 text-right">Fehl</th>
                  <th className="px-2 py-2 text-right">Vorschlag</th>
                  <th className="px-2 py-2 text-left">Stammlieferant</th>
                  <th className="px-2 py-2 text-left">2nd Source</th>
                  <th className="px-2 py-2 text-left">Quelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Keine Datensätze</td></tr>
                )}
                {filtered.map(r => {
                  const isShort = r.shortage > 0;
                  const choice = sourceChoice[r.art_nr] ?? 'best';
                  const qty = overrideQty[r.art_nr] ?? r.suggested_qty;
                  const canSelect = isShort && !!r.primary_lief_nr;
                  return (
                    <tr key={r.art_nr} className={cn(isShort && 'bg-amber-500/5')}>
                      <td className="px-2 py-1.5 align-top">
                        <Checkbox
                          checked={selected.has(r.art_nr)}
                          disabled={!canSelect}
                          onCheckedChange={(v) => setSelected(s => {
                            const n = new Set(s);
                            if (v === true) n.add(r.art_nr); else n.delete(r.art_nr);
                            return n;
                          })}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <div className="font-mono text-[11px] text-foreground">{r.art_nr}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">{r.bezeich_1}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.on_hand)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.reserved)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.open_demand)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.open_supply)}</td>
                      <td className={cn('px-2 py-1.5 text-right tabular-nums font-medium',
                        r.net_available < 0 && 'text-destructive')}>
                        {fmt(r.net_available)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.reorder_point)}</td>
                      <td className={cn('px-2 py-1.5 text-right tabular-nums',
                        isShort ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground')}>
                        {fmt(r.shortage)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {isShort ? (
                          <Input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => setOverrideQty(s => ({ ...s, [r.art_nr]: Number(e.target.value) }))}
                            className="h-7 w-20 text-xs text-right tabular-nums ml-auto"
                          />
                        ) : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <SupplierCell name={r.primary_supplier_name} code={r.primary_lief_nr} price={r.primary_price} lz={r.primary_lieferzeit} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <SupplierCell
                          name={r.second_supplier_name} code={r.second_lief_nr} price={r.second_price} lz={r.second_lieferzeit}
                          cheaper={r.second_price != null && r.primary_price != null && r.second_price < r.primary_price}
                          savings={r.savings}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        {isShort && r.primary_lief_nr ? (
                          <Select value={choice} onValueChange={(v) => setSourceChoice(s => ({ ...s, [r.art_nr]: v as SourceChoice }))}>
                            <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="best">Günstigster</SelectItem>
                              <SelectItem value="primary">Stamm</SelectItem>
                              <SelectItem value="second" disabled={!r.second_lief_nr}>2nd Source</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : <span className="text-muted-foreground text-[11px]">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </Card>
  );
}

function SupplierCell({
  name, code, price, lz, cheaper, savings,
}: {
  name: string | null; code: string | null; price: number | null; lz: number | null;
  cheaper?: boolean; savings?: number;
}) {
  if (!code) return <span className="text-muted-foreground text-[11px]">–</span>;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-foreground truncate max-w-[160px]">{name || code}</span>
        {cheaper && <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">günstiger</Badge>}
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        {fmtEUR(price)}{lz != null && ` · ${lz} T`}
        {cheaper && savings != null && savings > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400 ml-1">−{fmtEUR(savings)}</span>
        )}
      </div>
    </div>
  );
}
