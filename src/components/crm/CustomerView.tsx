import { AlertTriangle } from 'lucide-react';
import { formatEUR } from '@/lib/crm';
import { customerInsight } from '@/lib/customerInsight';

export function CustomerView({ orders, deliveries, invoices }: { orders: any[]; deliveries: any[]; invoices: any[] }) {
  const r = customerInsight(orders, deliveries, invoices, new Date().toISOString().slice(0, 10));
  const kpis = [
    { label: 'Offene Aufträge', value: String(r.openOrders), sub: formatEUR(r.openOrderValue) },
    { label: 'Lieferscheine in Arbeit', value: String(r.pendingDeliveries), sub: 'noch nicht versendet' },
    { label: 'Offene Forderungen', value: formatEUR(r.openReceivables), sub: r.overdueCount ? `${formatEUR(r.overdueAmount)} überfällig` : 'nichts überfällig' },
    { label: 'Zahlungsverhalten', value: r.paymentLabel, sub: r.avgPaymentDelay === null ? '–' : `Ø ${r.avgPaymentDelay} Tage zur Fälligkeit` },
    { label: 'Letzte Bestellung', value: r.daysSinceOrder === null ? '–' : `vor ${r.daysSinceOrder} T.`, sub: '' },
  ];
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-border bg-card/60 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground mt-1">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      {r.hints.map(h => (
        <div key={h.text} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${h.level === 'warn' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted/40 text-muted-foreground'}`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{h.text}
        </div>
      ))}
    </div>
  );
}
