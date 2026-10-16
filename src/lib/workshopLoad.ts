export interface WoLoad {
  id: string; status: string; planned_start: string | null; planned_end: string | null; planned_hours: number | null;
}

/** Montag der Woche (UTC, YYYY-MM-DD). */
export const weekStart = (d: string) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const OPEN = new Set(['draft', 'planned', 'released', 'in_progress', 'issued']);

/**
 * Wochenauslastung: geplante Stunden offener Aufträge werden gleichmäßig auf die Wochen
 * von Start bis Ende verteilt; ohne Ende zählt nur die Startwoche, ohne Start die aktuelle Woche.
 */
export function weeklyLoad(orders: WoLoad[], today: string, capacity: number, weeks = 8) {
  const first = weekStart(today);
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, i * 7), hours: 0, count: 0 }));
  for (const o of orders) {
    if (!OPEN.has(o.status) || !o.planned_hours) continue;
    const s = weekStart(o.planned_start || today);
    const e = weekStart(o.planned_end && o.planned_end >= (o.planned_start || today) ? o.planned_end : (o.planned_start || today));
    const span: string[] = [];
    for (let w = s; w <= e; w = addDays(w, 7)) span.push(w);
    const per = o.planned_hours / span.length;
    for (const w of span) {
      const r = rows.find((x) => x.week === (w < first ? first : w));
      if (r) { r.hours += per; r.count += 1; }
    }
  }
  return rows.map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10, utilization: capacity > 0 ? Math.round((r.hours / capacity) * 100) : null }));
}

export interface CostInput {
  planned_hours: number | null; actual_hours: number | null;
  items: { qty_required: number; qty_issued: number; price: number | null }[];
}

/** Soll/Ist: Material = Menge × Bewertungspreis, Arbeit = Stunden × Stundensatz. */
export function orderCosts(o: CostInput, rate: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const matPlan = o.items.reduce((s, i) => s + (i.price ?? 0) * i.qty_required, 0);
  const matAct = o.items.reduce((s, i) => s + (i.price ?? 0) * i.qty_issued, 0);
  const labPlan = (o.planned_hours ?? 0) * rate;
  const labAct = (o.actual_hours ?? 0) * rate;
  const planned = r2(matPlan + labPlan), actual = r2(matAct + labAct);
  return {
    matPlan: r2(matPlan), matAct: r2(matAct), labPlan: r2(labPlan), labAct: r2(labAct), planned, actual,
    diff: r2(actual - planned), diffPct: planned > 0 ? Math.round(((actual - planned) / planned) * 100) : null,
    missingPrice: o.items.some((i) => i.price == null),
  };
}

/** Stückpreis: hinterlegter Preis gilt je Preiseinheit (Artikel-Feld PE, z. B. 1000); fehlt sie, gilt 1. */
export function unitPrice(price: number | null | undefined, pe: number | string | null | undefined): number | null {
  const p = Number(price);
  if (!(p > 0)) return null;
  const e = Number(pe);
  return p / (e > 0 ? e : 1);
}
