import { describe, expect, it } from 'vitest';
import { dueToday, personalHandoff, sortDayItems, type DayItem } from './myDay';

const now = new Date(2026, 9, 16, 14, 31);
describe('Mein Tag', () => {
  it('includes overdue and all of today, not tomorrow or undated tasks', () => {
    expect(dueToday('2026-10-15', now)).toBe(true);
    expect(dueToday('2026-10-16', now)).toBe(true);
    expect(dueToday(new Date(2026, 9, 16, 23, 59).toISOString(), now)).toBe(true);
    expect(dueToday('2026-10-17', now)).toBe(false);
    expect(dueToday(null, now)).toBe(false);
  });
  it('shows only open handoffs for active writers in their departments', () => {
    expect(personalHandoff('open', 'technical', ['technical', 'buying'], true, true)).toBe(true);
    expect(personalHandoff('open', 'finance', ['technical'], true, true)).toBe(false);
    expect(personalHandoff('done', 'technical', ['technical'], true, true)).toBe(false);
    expect(personalHandoff('open', 'technical', ['technical'], false, true)).toBe(false);
    expect(personalHandoff('open', 'technical', ['technical'], true, false)).toBe(false);
  });
  it('prioritizes overdue work and deduplicates identical items', () => {
    const item = (id: string, due: string | null, source: DayItem['source']): DayItem => ({ id, due, source, title: id, context: '', href: '/', opened: '2026-10-15' });
    const overdue = item('late', '2026-10-15', 'erp');
    expect(sortDayItems([item('handoff', null, 'handoff'), item('today', '2026-10-16', 'crm'), overdue, overdue], now).map(i => i.id)).toEqual(['late', 'today', 'handoff']);
  });
});