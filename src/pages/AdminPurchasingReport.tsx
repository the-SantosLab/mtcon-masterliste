import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, AlertTriangle, Clock, Package, Receipt } from "lucide-react";

type PO = {
  id: string; po_no: string; supplier_id: string | null; status: string;
  ordered_at: string | null; expected_at: string | null;
  confirmation_received_at: string | null; confirmed_delivery_date: string | null;
  delay_flagged_at: string | null; created_at: string;
};
type POI = { id: string; po_id: string; qty_ordered: number; qty_received: number | null; unit_price: number | null };
type SI = { id: string; supplier_id: string | null; total_amount: number | null; status: string; invoice_date: string | null; match_diff: number | null; created_at: string };
type GR = { id: string; po_id: string; received_at: string };

const RANGES = [
  { key: '30', label: '30 Tage' },
  { key: '90', label: '90 Tage' },
  { key: '365', label: '12 Monate' },
  { key: 'ytd', label: 'YTD' },
];

export default function AdminPurchasingReport() {
  const [range, setRange] = useState('90');
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<PO[]>([]);
  const [items, setItems] = useState<POI[]>([]);
  const [invoices, setInvoices] = useState<SI[]>([]);
  const [grs, setGrs] = useState<GR[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});

  const fromDate = useMemo(() => {
    if (range === 'ytd') return new Date(new Date().getFullYear(), 0, 1).toISOString();
    const d = new Date(); d.setDate(d.getDate() - Number(range)); return d.toISOString();
  }, [range]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: it }, { data: inv }, { data: gr }, { data: s }] = await Promise.all([
        (supabase.from('purchase_orders').select('*').gte('created_at', fromDate).limit(2000)) as any,
        (supabase.from('purchase_order_items').select('*').limit(5000)) as any,
        (supabase.from('supplier_invoices' as any).select('*').gte('created_at', fromDate).limit(2000)) as any,
        (supabase.from('goods_receipts').select('id, po_id, received_at').gte('received_at', fromDate).limit(2000)) as any,
        supabase.from('suppliers').select('id, name'),
      ]);
      setPos(p || []); setItems(it || []); setInvoices(inv || []); setGrs(gr || []);
      setSuppliers(Object.fromEntries((s || []).map((x: any) => [x.id, x.name])));
      setLoading(false);
    })();
  }, [fromDate]);

  const itemsByPo = useMemo(() => {
    const m = new Map<string, POI[]>();
    items.forEach(i => { const a = m.get(i.po_id) || []; a.push(i); m.set(i.po_id, a); });
    return m;
  }, [items]);

  const poValue = (poId: string) => (itemsByPo.get(poId) || []).reduce((s, i) => s + Number(i.qty_ordered || 0) * Number(i.unit_price || 0), 0);

  const kpis = useMemo(() => {
    const totalValue = pos.reduce((s, p) => s + poValue(p.id), 0);
    const openPos = pos.filter(p => p.status !== 'cancelled' && p.status !== 'received');
    const openValue = openPos.reduce((s, p) => s + poValue(p.id), 0);
    const delayed = pos.filter(p => p.delay_flagged_at).length;
    const missingAB = pos.filter(p => !p.confirmation_received_at && p.status !== 'received' && p.status !== 'cancelled').length;
    const invTotal = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const invOpen = invoices.filter(i => i.status === 'open' || i.status === 'matched').reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const invDiff = invoices.filter(i => Math.abs(Number(i.match_diff || 0)) > 0.5).length;
    // On-time delivery: GRs where received_at <= expected_at
    const grPoMap = new Map(grs.map(g => [g.po_id, g.received_at]));
    const delivered = pos.filter(p => grPoMap.has(p.id));
    const onTime = delivered.filter(p => {
      const exp = p.confirmed_delivery_date || p.expected_at; if (!exp) return false;
      return new Date(grPoMap.get(p.id)!) <= new Date(exp);
    }).length;
    const onTimePct = delivered.length ? Math.round((onTime / delivered.length) * 100) : null;
    // Avg lead time (ordered -> received) in days
    const leads = delivered.map(p => {
      if (!p.ordered_at) return null;
      const d = (new Date(grPoMap.get(p.id)!).getTime() - new Date(p.ordered_at).getTime()) / 86400000;
      return d;
    }).filter((x): x is number => x != null);
    const avgLead = leads.length ? +(leads.reduce((s, x) => s + x, 0) / leads.length).toFixed(1) : null;
    return { totalValue, openValue, openCount: openPos.length, delayed, missingAB, invTotal, invOpen, invDiff, onTimePct, avgLead, poCount: pos.length };
  }, [pos, itemsByPo, invoices, grs]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, { value: number; count: number; delayed: number; invDiff: number }>();
    pos.forEach(p => {
      if (!p.supplier_id) return;
      const e = map.get(p.supplier_id) || { value: 0, count: 0, delayed: 0, invDiff: 0 };
      e.value += poValue(p.id); e.count++; if (p.delay_flagged_at) e.delayed++;
      map.set(p.supplier_id, e);
    });
    invoices.forEach(i => {
      if (!i.supplier_id) return;
      const e = map.get(i.supplier_id) || { value: 0, count: 0, delayed: 0, invDiff: 0 };
      if (Math.abs(Number(i.match_diff || 0)) > 0.5) e.invDiff++;
      map.set(i.supplier_id, e);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: suppliers[id] || '—', ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [pos, invoices, itemsByPo, suppliers]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    pos.forEach(p => {
      const d = p.ordered_at || p.created_at; if (!d) return;
      const key = d.slice(0, 7);
      m.set(key, (m.get(key) || 0) + poValue(p.id));
    });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b)).slice(-12);
  }, [pos, itemsByPo]);

  const maxMonth = Math.max(1, ...byMonth.map(([,v]) => v));
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5" /> GF-Reporting Einkauf</h1>
            <p className="text-sm text-muted-foreground mt-1">Volumen, Liefertreue, AB-Quote, Rechnungs-Differenzen, Top-Lieferanten.</p>
          </div>
          <div className="flex gap-1">
            {RANGES.map(r => (
              <Button key={r.key} size="sm" variant={range===r.key?'default':'outline'} onClick={() => setRange(r.key)} className="text-xs">{r.label}</Button>
            ))}
          </div>
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Lade…</div> : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={<Package className="h-4 w-4" />} label="Bestellvolumen" value={`${fmt(kpis.totalValue)} €`} sub={`${kpis.poCount} POs`} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Offenes Volumen" value={`${fmt(kpis.openValue)} €`} sub={`${kpis.openCount} offen`} />
          <Kpi icon={<Clock className="h-4 w-4" />} label="Liefertreue" value={kpis.onTimePct != null ? `${kpis.onTimePct} %` : '—'} sub={kpis.avgLead != null ? `Ø ${kpis.avgLead} Tage Lead` : '—'} />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Im Verzug" value={String(kpis.delayed)} sub={`${kpis.missingAB} ohne AB`} tone={kpis.delayed > 0 ? 'warn' : undefined} />
          <Kpi icon={<Receipt className="h-4 w-4" />} label="Eingangsrechnungen" value={`${fmt(kpis.invTotal)} €`} sub={`${fmt(kpis.invOpen)} € offen`} />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Rg-Differenzen" value={String(kpis.invDiff)} sub="> 0,50 € Diff" tone={kpis.invDiff > 0 ? 'warn' : undefined} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Bestellvolumen pro Monat</div>
            {byMonth.length === 0 ? <div className="text-xs text-muted-foreground">Keine Daten</div> : (
              <div className="space-y-1.5">
                {byMonth.map(([month, val]) => (
                  <div key={month} className="grid grid-cols-[80px_1fr_100px] items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-mono">{month}</span>
                    <div className="h-5 bg-muted/30 rounded relative overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${(val / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums">{fmt(val)} €</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Top 10 Lieferanten nach Volumen</div>
            {topSuppliers.length === 0 ? <div className="text-xs text-muted-foreground">Keine Daten</div> : (
              <div className="overflow-x-auto -mx-2 px-2"><table className="w-full text-xs min-w-[480px]">
                <thead className="text-[10px] uppercase text-muted-foreground">
                  <tr><th className="text-left p-1">Lieferant</th><th className="text-right p-1">Volumen</th><th className="text-right p-1">POs</th><th className="text-right p-1">Verzug</th><th className="text-right p-1">Rg-Diff</th></tr>
                </thead>
                <tbody>
                  {topSuppliers.map(s => (
                    <tr key={s.id} className="border-t border-border/40">
                      <td className="p-1.5">{s.name}</td>
                      <td className="p-1.5 text-right tabular-nums">{fmt(s.value)} €</td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{s.count}</td>
                      <td className="p-1.5 text-right tabular-nums">
                        {s.delayed > 0 ? <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/30">{s.delayed}</Badge> : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-1.5 text-right tabular-nums">
                        {s.invDiff > 0 ? <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">{s.invDiff}</Badge> : <span className="text-muted-foreground">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        </div>
        </>
        )}
      </div>
    </AppLayout>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">{icon}{label}</div>
      <div className={`text-xl tabular-nums mt-1 ${tone==='warn' ? 'text-amber-300' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
