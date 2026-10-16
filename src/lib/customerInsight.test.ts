import { describe, it, expect } from 'vitest';
import { customerInsight } from './customerInsight';

const inv = (p: any) => ({ status: 'sent', total_amount: 100, paid_amount: 0, due_date: null, paid_at: null, ...p });

describe('customerInsight', () => {
  it('drafts are no receivables, overdue invoices raise a hint', () => {
    const r = customerInsight([], [], [inv({ status: 'draft', due_date: '2026-01-01' }), inv({ due_date: '2026-10-01', paid_amount: 40 })], '2026-10-16');
    expect(r.openReceivables).toBe(60);
    expect(r.overdueCount).toBe(1);
    expect(r.hints[0].text).toContain('überfällig');
  });
  it('flags customers without order for more than 90 days', () => {
    expect(customerInsight([{ status: 'invoiced', total_amount: 1, created_at: '2026-07-17' }], [], [], '2026-10-16').hints).toHaveLength(1);
    expect(customerInsight([{ status: 'invoiced', total_amount: 1, created_at: '2026-07-18' }], [], [], '2026-10-16').hints).toHaveLength(0);
  });
  it('averages payment delay and counts only open orders', () => {
    const r = customerInsight([{ status: 'active', total_amount: 50, created_at: '2026-10-01' }, { status: 'delivered', total_amount: 9, created_at: '2026-10-01' }], [],
      [inv({ paid_amount: 100, due_date: '2026-09-01', paid_at: '2026-09-21' }), inv({ paid_amount: 100, due_date: '2026-09-01', paid_at: '2026-09-11' })], '2026-10-16');
    expect(r.avgPaymentDelay).toBe(15);
    expect(r.openOrders).toBe(1);
    expect(r.openOrderValue).toBe(50);
  });
});
