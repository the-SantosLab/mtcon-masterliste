import { describe, it, expect } from 'vitest';
import { calcRow, lzValue, openPoints } from './priceCalc';

const base = { with_galvanik: true, with_pruefung: true, with_lz: false, with_sws: false };

describe('priceCalc', () => {
  it('MGK 1 = Herstellkosten + Galvanik + Prüfung, MGK 2 = MGK 1 × Faktor', () => {
    const r = calcRow({ qty: 1000, hk: 100, galvanik: 20, pruefung: 5 }, base, 1.5, null);
    expect(r.mgk1).toBe(125);
    expect(r.mgk2).toBe(187.5);
    expect(r.vkPiece).toBe(0.1875);
  });
  it('abgewählte Galvanik zählt nicht', () => {
    expect(calcRow({ qty: 1, hk: 100, galvanik: 20, pruefung: 5 }, { ...base, with_galvanik: false }, 1, null).mgk1).toBe(105);
  });
  it('Legierungszuschlag = (Quartalsdurchschnitt − Preisbasis) × Verbrauch', () => {
    expect(lzValue(9.85, 5, 5.798)).toBeCloseTo(28.1203, 4);
  });
  it('fehlender Faktor ergibt keinen Preis', () => {
    const r = calcRow({ qty: 1, hk: 100, galvanik: 0, pruefung: 0 }, base, null, null);
    expect(r.vk1000).toBeNull();
    expect(r.missing).toContain('Faktor');
  });
  it('SWS ohne geklärten Rechenweg ergibt keinen Preis', () => {
    expect(calcRow({ qty: 1, hk: 100, galvanik: 0, pruefung: 0 }, { ...base, with_sws: true }, 2, null).vk1000).toBeNull();
  });
  it('ungeklärte Werte erscheinen als offene Punkte', () => {
    const p = openPoints([{ key: 'factor', value: 2, status: 'unclear' }], base);
    expect(p).toEqual(['factor: Wert ungeklärt']);
  });
});

import { calcItemFromCalc } from './priceCalc';
describe('calcItemFromCalc', () => {
  const c = { status: 'final', art_nr: 'A1', factor: 2, with_galvanik: false, with_pruefung: false, with_lz: false, with_sws: false, rows: [{ qty: 1000, hk: 100, galvanik: null, pruefung: null }] };
  it('übernimmt Stückpreis und Staffelmenge', () => {
    expect(calcItemFromCalc(c, 0)).toMatchObject({ quantity: 1000, unit_price: 0.2, art_nr: 'A1' });
  });
  it('Entwürfe werden nicht übernommen', () => {
    expect(calcItemFromCalc({ ...c, status: 'draft' }, 0)).toBeNull();
  });
});
