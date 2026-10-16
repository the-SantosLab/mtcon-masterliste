import { describe, it, expect } from 'vitest';
import { weeklyLoad, orderCosts, weekStart } from './workshopLoad';

describe('workshopLoad', () => {
  it('Wochenbeginn ist Montag', () => { expect(weekStart('2026-10-18')).toBe('2026-10-12'); });
  it('verteilt Stunden gleichmäßig über die Wochen', () => {
    const r = weeklyLoad([{ id: '1', status: 'released', planned_start: '2026-10-12', planned_end: '2026-10-21', planned_hours: 40 }], '2026-10-16', 40);
    expect(r[0].hours).toBe(20); expect(r[1].hours).toBe(20); expect(r[0].utilization).toBe(50);
  });
  it('abgeschlossene und stornierte Aufträge zählen nicht', () => {
    const r = weeklyLoad([{ id: '1', status: 'completed', planned_start: '2026-10-12', planned_end: null, planned_hours: 10 },
      { id: '2', status: 'cancelled', planned_start: '2026-10-12', planned_end: null, planned_hours: 10 }], '2026-10-16', 40);
    expect(r[0].hours).toBe(0);
  });
  it('überfällige Planung landet in der aktuellen Woche', () => {
    const r = weeklyLoad([{ id: '1', status: 'issued', planned_start: '2026-09-01', planned_end: null, planned_hours: 8 }], '2026-10-16', 40);
    expect(r[0].hours).toBe(8);
  });
  it('Soll/Ist: Material × Preis + Stunden × Satz', () => {
    const c = orderCosts({ planned_hours: 10, actual_hours: 12, items: [{ qty_required: 4, qty_issued: 5, price: 10 }] }, 65);
    expect(c.planned).toBe(690); expect(c.actual).toBe(830); expect(c.diff).toBe(140); expect(c.diffPct).toBe(20);
  });
});

import { unitPrice } from './workshopLoad';
describe('Preiseinheit', () => {
  it('481,99 € je 1000 Stück ergibt 0,48199 € je Stück', () => { expect(unitPrice(481.99, 1000)).toBeCloseTo(0.48199, 6); });
  it('fehlende oder ungültige Preiseinheit zählt als 1', () => { expect(unitPrice(5, null)).toBe(5); expect(unitPrice(5, 0)).toBe(5); expect(unitPrice(5, '100')).toBe(0.05); });
  it('ohne Preis kein Stückpreis', () => { expect(unitPrice(0, 1000)).toBeNull(); expect(unitPrice(null, 1)).toBeNull(); });
  it('2500 Stück zu 481,99 € je 1000 kosten 1.204,98 €', () => {
    const c = orderCosts({ planned_hours: 0, actual_hours: 0, items: [{ qty_required: 2500, qty_issued: 0, price: unitPrice(481.99, 1000) }] }, 65);
    expect(c.matPlan).toBe(1204.98);
  });
});
