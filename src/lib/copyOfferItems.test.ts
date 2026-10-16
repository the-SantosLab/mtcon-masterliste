import { describe, it, expect } from 'vitest';
import { copyItems } from './copyOfferItems';

describe('copyItems', () => {
  it('keeps offer discounts and appends after existing lines in source order', () => {
    const r = copyItems('offer', [{ sort_order: 2, description: 'B', quantity: '2', unit_price: '5', discount_pct: '10' }, { sort_order: 1, description: 'A', quantity: 1, unit_price: 3, discount_pct: 0 }], 3, () => 'x');
    expect(r.map(i => i.description)).toEqual(['A', 'B']);
    expect(r[1]).toMatchObject({ quantity: 2, unit_price: 5, discount_pct: 10, sort_order: 4, _new: true });
  });
  it('order lines take article number from sku and start without discount', () => {
    const r = copyItems('order', [{ position: 1, sku: 'ART-1', description: 'X', quantity: 4, unit_price: 7, discount_pct: 50 }], 0, () => 'x');
    expect(r[0]).toMatchObject({ art_nr: 'ART-1', discount_pct: 0, unit_price: 7 });
  });
});
