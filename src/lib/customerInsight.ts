// Pure rules for the CRM customer view (open orders, receivables, payment behaviour, hints).
export const INACTIVE_ORDER_DAYS = 90;
const CLOSED_ORDER = ['delivered', 'invoiced', 'completed', 'closed', 'cancelled'];
const NOT_RECEIVABLE = ['draft', 'cancelled', 'storniert'];

export interface InsightOrder { status: string; total_amount: number | null; order_date?: string | null; created_at: string }
export interface InsightDelivery { status: string }
export interface InsightInvoice {
  status: string; total_amount: number | null; paid_amount: number | null;
  due_date: string | null; paid_at: string | null; payment_status?: string | null;
}

const day = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00Z').getTime();
const DAY = 86400000;

export function openAmount(i: InsightInvoice) {
  return Math.max(0, Math.round(((i.total_amount ?? 0) - (i.paid_amount ?? 0)) * 100) / 100);
}

export function customerInsight(orders: InsightOrder[], deliveries: InsightDelivery[], invoices: InsightInvoice[], today: string) {
  const t = day(today);
  const openOrders = orders.filter(o => !CLOSED_ORDER.includes(o.status));
  const receivable = invoices.filter(i => !NOT_RECEIVABLE.includes(i.status) && openAmount(i) > 0.01);
  const overdue = receivable.filter(i => i.due_date && day(i.due_date) < t);
  const late = invoices.filter(i => i.paid_at && i.due_date).map(i => Math.round((day(i.paid_at!) - day(i.due_date!)) / DAY));
  const avgDelay = late.length ? Math.round(late.reduce((a, b) => a + b, 0) / late.length) : null;
  const lastOrder = orders.map(o => o.order_date || o.created_at).sort().pop() ?? null;
  const daysSinceOrder = lastOrder ? Math.floor((t - day(lastOrder)) / DAY) : null;

  const hints: { level: 'warn' | 'info'; text: string }[] = [];
  if (overdue.length) hints.push({ level: 'warn', text: `${overdue.length} Rechnung(en) überfällig – vor neuem Angebot klären` });
  if (daysSinceOrder !== null && daysSinceOrder > INACTIVE_ORDER_DAYS) hints.push({ level: 'info', text: `Seit ${daysSinceOrder} Tagen keine Bestellung` });
  if (avgDelay !== null && avgDelay > 14) hints.push({ level: 'warn', text: `Zahlt im Schnitt ${avgDelay} Tage nach Fälligkeit` });

  return {
    openOrders: openOrders.length,
    openOrderValue: openOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0),
    pendingDeliveries: deliveries.filter(d => d.status === 'draft').length,
    openReceivables: receivable.reduce((s, i) => s + openAmount(i), 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, i) => s + openAmount(i), 0),
    avgPaymentDelay: avgDelay,
    paymentLabel: avgDelay === null ? 'Keine Zahlungen' : avgDelay <= 0 ? 'Pünktlich' : avgDelay <= 14 ? 'Leicht verspätet' : 'Verspätet',
    daysSinceOrder,
    hints,
  };
}
