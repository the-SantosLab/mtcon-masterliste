import { describe, it, expect } from 'vitest';
import { leadKeyFacts } from './leadKeyFacts';

const deal = (p: any) => ({ stage: 'anfrage', value_final: null, value_estimated: null, probability_override: null, ...p }) as any;
const probs = [{ stage: 'anfrage', probability: 10 }, { stage: 'verhandlung', probability: 60 }];

describe('leadKeyFacts', () => {
  it('Bestellvolumen ohne stornierte Aufträge', () => {
    const k = leadKeyFacts([{ status: 'active', total_amount: 1190, subtotal_amount: 1000 }, { status: 'cancelled', total_amount: 500 }], [], probs);
    expect(k.orderVolume).toBe(1000); expect(k.orderCount).toBe(1);
  });
  it('Forecast = Wert × Wahrscheinlichkeit, manuelle Wahrscheinlichkeit hat Vorrang', () => {
    const k = leadKeyFacts([], [deal({ stage: 'verhandlung', value_estimated: 10000 }), deal({ value_estimated: 5000, probability_override: 50 }), deal({ stage: 'won', value_final: 9999 })], probs);
    expect(k.pipeline).toBe(15000); expect(k.forecast).toBe(8500); expect(k.openDeals).toBe(2);
  });
  it('Abschlussquote aus gewonnenen und verlorenen Chancen', () => {
    const k = leadKeyFacts([], [deal({ stage: 'won' }), deal({ stage: 'lost' }), deal({ stage: 'lost' }), deal({})], probs);
    expect(k.winRate).toBe(33);
  });
});
