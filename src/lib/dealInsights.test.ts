import { describe, it, expect } from 'vitest';
import { missingProjectInfo, competitorStats } from './dealPages';

describe('Projektinformationen', () => {
  it('meldet fehlende SOP, Lieferadresse und Menge', () => {
    expect(missingProjectInfo({ sop: null, delivery_address: ' ', quantity: 0 })).toEqual(['SOP', 'Lieferadresse', 'Menge']);
  });
  it('ist vollständig mit allen drei Angaben', () => {
    expect(missingProjectInfo({ sop: '2027-Q1', delivery_address: 'Werk 1', quantity: 5 })).toEqual([]);
  });
});

describe('Mitbewerber-Auswertung', () => {
  it('zählt Chancen je Mitbewerber nach Ausgang', () => {
    const s = competitorStats(
      [{ competitor_id: 'c', deal_id: 'a' }, { competitor_id: 'c', deal_id: 'b' }, { competitor_id: 'c', deal_id: 'x' }],
      [{ id: 'a', stage: 'won' }, { id: 'b', stage: 'verhandlung' }] as any,
    );
    expect(s.get('c')).toEqual({ deals: 2, won: 1, lost: 0, open: 1 });
  });
});
