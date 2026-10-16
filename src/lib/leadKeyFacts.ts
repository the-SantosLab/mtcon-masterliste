import { isOpenDeal, weightedValue, type Deal, type StageProbability } from './dealPages';

export interface KeyFactOrder { status: string | null; total_amount: number | null; subtotal_amount?: number | null; order_date?: string | null; created_at?: string }

/**
 * Key Facts für das Lead-Fenster:
 * - Gesamtbestellvolumen: Summe aller nicht stornierten Aufträge (Netto, sonst Brutto)
 * - Pipeline: Summe offener Verkaufschancen (Endwert vor Schätzwert)
 * - Forecast: gewichtete Summe offener Chancen (Wert × Wahrscheinlichkeit, manuelle Wahrscheinlichkeit hat Vorrang)
 */
export function leadKeyFacts(orders: KeyFactOrder[], deals: Deal[], probs: StageProbability[]) {
  const valid = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'storniert');
  const orderVolume = valid.reduce((s, o) => s + Number(o.subtotal_amount ?? o.total_amount ?? 0), 0);
  const open = deals.filter(isOpenDeal);
  const pipeline = open.reduce((s, d) => s + Number(d.value_final ?? d.value_estimated ?? 0), 0);
  const forecast = open.reduce((s, d) => s + weightedValue(d, probs), 0);
  const won = deals.filter((d) => d.stage === 'won').length;
  const closed = deals.filter((d) => d.stage === 'won' || d.stage === 'lost').length;
  const lastOrder = valid.map((o) => o.order_date || o.created_at || '').filter(Boolean).sort().at(-1) ?? null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    orderVolume: r(orderVolume), orderCount: valid.length, lastOrder,
    pipeline: r(pipeline), forecast: r(forecast), openDeals: open.length,
    winRate: closed ? Math.round((won / closed) * 100) : null,
  };
}
