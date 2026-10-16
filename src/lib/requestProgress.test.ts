import { describe, it, expect } from 'vitest';
import { requestPercent, departmentSteps } from './requestProgress';

describe('Anfragen-Fortschritt', () => {
  it('0 bis 100 Prozent aus erledigten Aufgaben', () => {
    expect(requestPercent([])).toBe(0);
    expect(requestPercent([{ department_id: 'a', status: 'done' }, { department_id: 'b', status: 'open' }])).toBe(50);
    expect(requestPercent([{ department_id: 'a', status: 'open' }], true)).toBe(100);
  });
  it('ein Schritt pro Abteilung mit Status', () => {
    const s = departmentSteps([
      { department_id: 'a', status: 'done' }, { department_id: 'b', status: 'in_progress' },
      { department_id: 'a', status: 'done' }, { department_id: 'c', status: 'open' },
    ]);
    expect(s.map((x) => [x.department_id, x.state, x.done, x.total])).toEqual([['a', 'done', 2, 2], ['b', 'active', 0, 1], ['c', 'open', 0, 1]]);
  });
});
