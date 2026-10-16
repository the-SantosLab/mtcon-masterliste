import { describe, it, expect } from 'vitest';
import { countDelta, countProgress } from './stockCount';

describe('stock count', () => {
  it('delta is counted minus expected', () => {
    expect(countDelta({ expected_qty: 10, counted_qty: 7 })).toBe(-3);
    expect(countDelta({ expected_qty: 1, counted_qty: 1.5 })).toBe(0.5);
  });
  it('uncounted line has no delta', () => {
    expect(countDelta({ expected_qty: 4, counted_qty: null })).toBeNull();
  });
  it('only complete when every line is counted', () => {
    const p = countProgress([{ expected_qty: 2, counted_qty: 2 }, { expected_qty: 3, counted_qty: null }]);
    expect(p).toMatchObject({ counted: 1, open: 1, deviations: 0, complete: false });
    expect(countProgress([{ expected_qty: 2, counted_qty: 1 }]).complete).toBe(true);
    expect(countProgress([]).complete).toBe(false);
  });
});
