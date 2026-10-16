import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { FinanceHeader } from '@/components/erp/FinanceHeader';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { formatEUR } from '@/lib/crm';
import { weeklyKpis, onTimeRate } from '@/lib/weeklyKpis';

export default function ManagementKpis() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ['management-kpis', today],
    queryFn: async () => {
      const s = supabase as any;
      const [i, o, d] = await Promise.all([
        s.from('invoices').select('status, invoice_date, created_at, total_amount, paid_amount, due_date').limit(5000),
        s.from('orders').select('id, status, order_date, created_at, total_amount, delivery_date').limit(5000),
        s.from('deliveries').select('status, delivery_date, created_at, order_id').limit(5000),
      ]);
      const orders = o.data ?? [];
      const k = weeklyKpis(i.data ?? [], orders, d.data ?? [], today);
      const promised = new Map(orders.map((x: any) => [x.id, x.delivery_date]));
      const rate = onTimeRate((d.data ?? []).filter((x: any) => x.status === 'shipped' && x.order_id)
        .map((x: any) => ({ promised: (promised.get(x.order_id) as string) ?? null, shipped: x.delivery_date })));
      return { ...k, rate };
    },
  });
  const rows = data?.rows ?? [];
  const max = Math.max(1, ...rows.flatMap(r => [r.revenue, r.intake]));
  const cur = rows.at(-1);
  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <FinanceHeader title="Kennzahlen Geschäftsführung" subtitle="Umsatz, Auftragseingang, Liefertreue und offene Forderungen der letzten acht Wochen." />
        <FulfillmentMetrics loading={isLoading} metrics={[
          { label: 'Umsatz diese Woche', value: formatEUR(cur?.revenue ?? 0) },
          { label: 'Auftragseingang diese Woche', value: formatEUR(cur?.intake ?? 0), detail: `${formatEUR(data?.openOrderValue ?? 0)} in Bearbeitung` },
          { label: 'Liefertreue', value: data?.rate == null ? '–' : `${data.rate} %`, detail: 'versendet bis zum zugesagten Termin' },
          { label: 'Offene Forderungen', value: formatEUR(data?.receivables ?? 0), detail: `${formatEUR(data?.overdue ?? 0)} überfällig`, tone: data?.overdue ? 'overdue' : undefined },
        ]} />
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" />Umsatz</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/50" />Auftragseingang</span>
          </div>
          <div className="grid grid-cols-8 items-end gap-3 h-48">
            {rows.map(r => (
              <div key={r.week} className="flex h-full flex-col justify-end gap-1">
                <div className="flex flex-1 items-end gap-1">
                  <div className="flex-1 rounded-t bg-primary" style={{ height: `${(r.revenue / max) * 100}%` }} title={formatEUR(r.revenue)} />
                  <div className="flex-1 rounded-t bg-muted-foreground/50" style={{ height: `${(r.intake / max) * 100}%` }} title={formatEUR(r.intake)} />
                </div>
                <p className="text-center text-[10px] text-muted-foreground tabular-nums">{new Date(r.week).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
