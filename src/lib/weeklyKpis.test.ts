import { describe, it, expect } from 'vitest';
import { weekStart, weeklyKpis, onTimeRate } from './weeklyKpis';

describe('weeklyKpis', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-16')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
  it('counts revenue without drafts and receivables with overdue part', () => {
    const r = weeklyKpis([
      { status: 'sent', invoice_date: '2026-10-13', created_at: '2026-10-13', total_amount: 100, paid_amount: 20, due_date: '2026-10-01' },
      { status: 'draft', invoice_date: '2026-10-13', created_at: '2026-10-13', total_amount: 500, paid_amount: 0, due_date: null },
    ], [], [], '2026-10-16');
    expect(r.rows.at(-1)!.revenue).toBe(100);
    expect(r.receivables).toBe(80);
    expect(r.overdue).toBe(80);
  });
  it('on-time rate counts shipments on or before the promised date', () => {
    expect(onTimeRate([{ promised: '2026-10-10', shipped: '2026-10-10' }, { promised: '2026-10-10', shipped: '2026-10-11' }])).toBe(50);
    expect(onTimeRate([])).toBeNull();
  });
});
