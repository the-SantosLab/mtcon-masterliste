// Weekly management figures computed from invoices, orders and deliveries.
export interface KpiInvoice { status: string; invoice_date: string | null; created_at: string; total_amount: number | null; paid_amount: number | null; due_date: string | null }
export interface KpiOrder { status: string; order_date: string | null; created_at: string; total_amount: number | null; delivery_date: string | null }
export interface KpiDelivery { status: string; delivery_date: string | null; created_at: string; order_id?: string | null }

const day = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00Z').getTime();
export function weekStart(iso: string) {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function weeklyKpis(invoices: KpiInvoice[], orders: KpiOrder[], deliveries: KpiDelivery[], today: string, weeks = 8) {
  const start = weekStart(today);
  const list = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const sent = invoices.filter(i => !['draft', 'cancelled'].includes(i.status));
  const rows = list.map(w => ({
    week: w,
    revenue: sent.filter(i => weekStart(i.invoice_date || i.created_at) === w).reduce((s, i) => s + (i.total_amount ?? 0), 0),
    intake: orders.filter(o => o.status !== 'cancelled' && weekStart(o.order_date || o.created_at) === w).reduce((s, o) => s + (o.total_amount ?? 0), 0),
  }));
  const open = sent.map(i => ({ ...i, open: Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)) })).filter(i => i.open > 0.01);
  const shipped = deliveries.filter(d => d.status === 'shipped' && d.delivery_date);
  const t = day(today);
  return {
    rows,
    receivables: open.reduce((s, i) => s + i.open, 0),
    overdue: open.filter(i => i.due_date && day(i.due_date) < t).reduce((s, i) => s + i.open, 0),
    openOrderValue: orders.filter(o => o.status === 'active').reduce((s, o) => s + (o.total_amount ?? 0), 0),
    shippedCount: shipped.length,
  };
}

/** Share of orders whose delivery went out on or before the promised order delivery date. */
export function onTimeRate(pairs: { promised: string | null; shipped: string | null }[]) {
  const valid = pairs.filter(p => p.promised && p.shipped);
  if (!valid.length) return null;
  return Math.round(valid.filter(p => day(p.shipped!) <= day(p.promised!)).length / valid.length * 100);
}
