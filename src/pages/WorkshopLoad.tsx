import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { FulfillmentHeader, FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { formatEUR } from '@/lib/crm';
import { weeklyLoad, orderCosts, unitPrice } from '@/lib/workshopLoad';
import { toast } from 'sonner';

const num = (v: any) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

export default function WorkshopLoad() {
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === 'staff';
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ['workshop-load', today],
    queryFn: async () => {
      const s = supabase as any;
      const [w, set] = await Promise.all([
        s.from('production_orders').select('id, wo_no, art_nr, description, quantity, status, planned_start, planned_end, planned_hours, actual_hours, order_id, orders(order_no, customer_name), production_order_items(component_art_nr, qty_required, qty_issued)')
          .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1000),
        s.from('system_settings').select('key, value').in('key', ['workshop_capacity_hours_week', 'workshop_hourly_rate']),
      ]);
      const wos = w.data ?? [];
      const arts = [...new Set(wos.flatMap((o: any) => (o.production_order_items ?? []).map((i: any) => i.component_art_nr)).filter(Boolean))];
      const prices = new Map<string, number>();
      for (let i = 0; i < arts.length; i += 200) {
        const chunk = arts.slice(i, i + 200);
        const [{ data: p }, { data: a }] = await Promise.all([
          s.from('article_prices').select('art_nr, durchschnittspreis, bewertungspreis, standardpreis, einkaufspreis, letzter_ep').in('art_nr', chunk),
          s.from('articles').select('art_nr, pe').in('art_nr', chunk),
        ]);
        const pe = new Map((a ?? []).map((r: any) => [r.art_nr, r.pe]));
        for (const r of p ?? []) {
          const v = [r.durchschnittspreis, r.bewertungspreis, r.standardpreis, r.einkaufspreis, r.letzter_ep].map(Number).find((x) => x > 0);
          const u = unitPrice(v, pe.get(r.art_nr) as any);
          if (u != null) prices.set(r.art_nr, u);
        }
      }
      const cfg = Object.fromEntries((set.data ?? []).map((r: any) => [r.key, Number(r.value)]));
      return { wos, prices, capacity: cfg.workshop_capacity_hours_week ?? 40, rate: cfg.workshop_hourly_rate ?? 65 };
    },
  });

  const capacity = data?.capacity ?? 40, rate = data?.rate ?? 65;
  const load = weeklyLoad((data?.wos ?? []).map((o: any) => ({ ...o, planned_hours: num(o.planned_hours) })), today, capacity);
  const max = Math.max(capacity, ...load.map((r) => r.hours), 1);
  const rows = (data?.wos ?? []).map((o: any) => ({
    o, c: orderCosts({
      planned_hours: num(o.planned_hours), actual_hours: num(o.actual_hours),
      items: (o.production_order_items ?? []).map((i: any) => ({ qty_required: Number(i.qty_required || 0), qty_issued: Number(i.qty_issued || 0), price: data?.prices.get(i.component_art_nr) ?? null })),
    }, rate),
  }));
  const done = rows.filter((r: any) => r.o.status === 'completed' || r.o.status === 'done');
  const totalDiff = done.reduce((s: number, r: any) => s + r.c.diff, 0);
  const noHours = rows.filter((r: any) => !['completed', 'done'].includes(r.o.status) && !num(r.o.planned_hours)).length;
  const peak = load.reduce((m, r) => Math.max(m, r.utilization ?? 0), 0);

  const saveHours = async (id: string, field: 'planned_hours' | 'actual_hours', v: string) => {
    const { error } = await (supabase as any).from('production_orders').update({ [field]: num(v) }).eq('id', id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ['workshop-load'] });
  };
  const saveSetting = async (key: string, v: string) => {
    const n = num(v); if (n == null || n < 0) return;
    const { error } = await (supabase as any).from('system_settings').upsert({ key, value: n });
    if (error) toast.error(error.message); else { toast.success('Gespeichert'); qc.invalidateQueries({ queryKey: ['workshop-load'] }); }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <FulfillmentHeader title="Werkstattauslastung & Nachkalkulation" subtitle="Geplante Stunden je Woche gegen Kapazität · Soll/Ist-Kosten je Werkstattauftrag" />
        <FulfillmentMetrics loading={isLoading} metrics={[
          { label: 'Diese Woche', value: `${load[0]?.hours ?? 0} h`, detail: `von ${capacity} h Kapazität` },
          { label: 'Höchste Auslastung (8 Wochen)', value: `${peak} %`, tone: peak > 100 ? 'overdue' : undefined },
          { label: 'Abweichung abgeschlossene Aufträge', value: formatEUR(totalDiff), detail: `${done.length} Aufträge`, tone: totalDiff > 0 ? 'overdue' : undefined },
          { label: 'Offen ohne Stundenplanung', value: String(noHours) },
        ]} />

        <section className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4 text-xs">
            <p className="font-medium flex-1">Auslastung nächste 8 Wochen</p>
            <label className="space-y-1"><span className="text-muted-foreground">Kapazität h/Woche</span>
              <Input key={capacity} defaultValue={capacity} disabled={!isAdmin} className="h-8 w-24" onBlur={(e) => Number(e.target.value) !== capacity && saveSetting('workshop_capacity_hours_week', e.target.value)} /></label>
            <label className="space-y-1"><span className="text-muted-foreground">Stundensatz €</span>
              <Input key={rate} defaultValue={rate} disabled={!isAdmin} className="h-8 w-24" onBlur={(e) => Number(e.target.value) !== rate && saveSetting('workshop_hourly_rate', e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-8 items-end gap-3 h-44 relative">
            {load.map((r) => (
              <div key={r.week} className="flex h-full flex-col justify-end gap-1">
                <p className="text-center text-[10px] tabular-nums text-muted-foreground">{r.utilization ?? 0} %</p>
                <div className="relative flex-1 flex items-end">
                  <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60" style={{ bottom: `${(capacity / max) * 100}%` }} />
                  <div className={`w-full rounded-t ${(r.utilization ?? 0) > 100 ? 'bg-destructive' : 'bg-primary'}`} style={{ height: `${(r.hours / max) * 100}%` }} title={`${r.hours} h · ${r.count} Aufträge`} />
                </div>
                <p className="text-center text-[10px] text-muted-foreground tabular-nums">KW {new Date(r.week).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Gestrichelt: Kapazität. Geplante Stunden werden gleichmäßig auf die Wochen von Start bis Ende verteilt.</p>
        </section>

        <section className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Werkstattauftrag</TableHead><TableHead>Kundenauftrag</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Std. Soll</TableHead><TableHead className="text-right">Std. Ist</TableHead>
              <TableHead className="text-right">Material Soll / Ist</TableHead><TableHead className="text-right">Kosten Soll</TableHead>
              <TableHead className="text-right">Kosten Ist</TableHead><TableHead className="text-right">Abweichung</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(({ o, c }: any) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs"><span className="font-mono">{o.wo_no}</span><span className="block text-muted-foreground truncate max-w-[220px]">{o.description || o.art_nr}</span></TableCell>
                  <TableCell className="text-xs">{o.orders ? `${o.orders.order_no} · ${o.orders.customer_name || ''}` : '—'}</TableCell>
                  <TableCell className="text-xs">{o.status}</TableCell>
                  {(['planned_hours', 'actual_hours'] as const).map((f) => (
                    <TableCell key={f} className="text-right">
                      <Input aria-label={f === 'planned_hours' ? 'Geplante Stunden' : 'Tatsächliche Stunden'} defaultValue={o[f] ?? ''} disabled={!canEdit} className="h-7 w-20 ml-auto text-right text-xs"
                        onBlur={(e) => (num(e.target.value) ?? null) !== (num(o[f]) ?? null) && saveHours(o.id, f, e.target.value)} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs tabular-nums">{formatEUR(c.matPlan)} / {formatEUR(c.matAct)}{c.missingPrice && <span className="block text-[10px] text-muted-foreground">Preis fehlt teilweise</span>}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatEUR(c.planned)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatEUR(c.actual)}</TableCell>
                  <TableCell className={`text-right text-xs tabular-nums ${c.diff > 0 ? 'text-destructive' : ''}`}>{formatEUR(c.diff)}{c.diffPct != null && ` (${c.diffPct > 0 ? '+' : ''}${c.diffPct} %)`}</TableCell>
                </TableRow>
              ))}
              {!rows.length && !isLoading && <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground">Keine Werkstattaufträge</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
        {!canEdit && <Button variant="ghost" disabled className="text-xs">Nur Lesen</Button>}
      </div>
    </AppLayout>
  );
}
