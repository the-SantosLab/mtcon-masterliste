import { describe, expect, it } from 'vitest';
import {
  filterForPage, groupByType, isDueSoon, isFollowUp, isOverdue, overviewStats, type Activity,
} from './activityPages';

const NOW = new Date('2026-10-16T08:00:00Z').getTime();
const iso = (d: string) => `${d}T08:00:00Z`;

const act = (over: Partial<Activity>): Activity => ({
  id: crypto.randomUUID(), contact_id: null, company_id: null, deal_id: null, lead_id: null,
  owner_id: 'u1', subject: 'S', type: 'task', body: null,
  created_at: iso('2026-10-01'), due_at: null, completed_at: null, completed_by: null,
  auto_generated: false, ...over,
} as Activity);

describe('activity page rules', () => {
  it('marks open activities past their due date as overdue', () => {
    expect(isOverdue(act({ due_at: iso('2026-10-15') }), NOW)).toBe(true);
    expect(isOverdue(act({ due_at: iso('2026-10-20') }), NOW)).toBe(false);
    expect(isOverdue(act({ due_at: iso('2026-10-15'), completed_at: iso('2026-10-16') }), NOW)).toBe(false);
    expect(isOverdue(act({}), NOW)).toBe(false);
  });

  it('treats activities due within 7 days as due soon, including overdue ones', () => {
    expect(isDueSoon(act({ due_at: iso('2026-10-20') }), NOW)).toBe(true);
    expect(isDueSoon(act({ due_at: iso('2026-10-15') }), NOW)).toBe(true);
    expect(isDueSoon(act({ due_at: iso('2026-10-30') }), NOW)).toBe(false);
    expect(isDueSoon(act({ due_at: iso('2026-10-20'), completed_at: iso('2026-10-16') }), NOW)).toBe(false);
  });

  it('recognizes follow-ups only by their explicit type', () => {
    expect(isFollowUp(act({ type: 'followup' }))).toBe(true);
    expect(isFollowUp(act({ type: 'task' }))).toBe(false);
  });

  it('tasks page shows only open tasks, earliest due date first', () => {
    const list = [
      act({ type: 'task', due_at: iso('2026-10-25') }),
      act({ type: 'task', due_at: iso('2026-10-18') }),
      act({ type: 'task', completed_at: iso('2026-10-10') }),
      act({ type: 'call' }),
    ];
    const out = filterForPage('tasks', list, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].due_at).toBe(iso('2026-10-18'));
  });

  it('followups page shows only open follow-ups', () => {
    const list = [
      act({ type: 'followup', due_at: iso('2026-10-20') }),
      act({ type: 'followup', completed_at: iso('2026-10-10') }),
      act({ type: 'task' }),
    ];
    expect(filterForPage('followups', list, NOW)).toHaveLength(1);
  });

  it('done page shows completed activities, most recent completion first', () => {
    const list = [
      act({ completed_at: iso('2026-10-10') }),
      act({ completed_at: iso('2026-10-14') }),
      act({}),
    ];
    const out = filterForPage('done', list, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].completed_at).toBe(iso('2026-10-14'));
  });

  it('overview stats count open, overdue, due-soon and unassigned activities', () => {
    const list = [
      act({ due_at: iso('2026-10-15') }),
      act({ due_at: iso('2026-10-20'), owner_id: null }),
      act({ due_at: iso('2026-12-01') }),
      act({ completed_at: iso('2026-10-10') }),
    ];
    expect(overviewStats(list, NOW)).toEqual({ total: 4, open: 3, overdue: 1, dueSoon: 2, unassigned: 1 });
  });

  it('groups activities by type with German labels, most frequent first', () => {
    const list = [act({ type: 'call' }), act({ type: 'call' }), act({ type: 'note' })];
    expect(groupByType(list)).toEqual([
      { name: 'Telefonat', count: 2 },
      { name: 'Notiz', count: 1 },
    ]);
  });
});
