import { describe, it, expect } from 'vitest';
import { leadsForPage, scoreBand, isProtected } from './leadPipeline';
import type { AcquisitionLead } from './acquisition';

const lead = (p: Partial<AcquisitionLead>) => ({ id: 'x', company_name: 'A', status: 'neu', score: 0, assigned_to: null, updated_at: '2026-10-01', protected_until: null, ...p } as AcquisitionLead);

describe('Interessenten-Seiten', () => {
  it('qualifying shows only new leads', () => {
    expect(leadsForPage('qualify', [lead({ id: 'a' }), lead({ id: 'b', status: 'qualifiziert' })]).map(l => l.id)).toEqual(['a']);
  });
  it('conversion lists qualified and campaign leads only', () => {
    expect(leadsForPage('convert', [lead({ id: 'a', status: 'qualifiziert' }), lead({ id: 'b', status: 'eingeschrieben' }), lead({ id: 'c' })]).map(l => l.id)).toEqual(['a', 'b']);
  });
  it('archive lists rejected leads', () => {
    expect(leadsForPage('archive', [lead({ id: 'a', status: 'abgelehnt' }), lead({ id: 'b' })]).map(l => l.id)).toEqual(['a']);
  });
  it('scoring excludes closed leads and sorts by score', () => {
    expect(leadsForPage('score', [lead({ id: 'a', score: 10 }), lead({ id: 'b', score: 80 }), lead({ id: 'c', status: 'konvertiert', score: 99 })]).map(l => l.id)).toEqual(['b', 'a']);
  });
  it('score bands at 70 and 40', () => {
    expect([scoreBand(70), scoreBand(69), scoreBand(40), scoreBand(39)]).toEqual(['hot', 'warm', 'warm', 'cold']);
  });
  it('protection only counts while in the future', () => {
    const now = Date.parse('2026-10-16T00:00:00Z');
    expect(isProtected(lead({ protected_until: '2026-10-17' }), now)).toBe(true);
    expect(isProtected(lead({ protected_until: '2026-10-15' }), now)).toBe(false);
  });
});
