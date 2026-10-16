import { describe, it, expect } from 'vitest';
import { revLabel, isOutdated } from './drawings';

describe('Zeichnungsrevisionen', () => {
  it('zählt Revisionen als Buchstaben', () => {
    expect([1, 2, 26, 27].map(revLabel)).toEqual(['A', 'B', 'Z', 'AA']);
  });
  it('Set-Position ist veraltet, wenn eine neuere Revision existiert', () => {
    expect(isOutdated(1, 2)).toBe(true);
    expect(isOutdated(2, 2)).toBe(false);
    expect(isOutdated(null, 3)).toBe(false);
  });
});
