import { describe, expect, it } from 'vitest';
import { canIssue, canReceive, parseMaterialQuantity, validReturn, hasOpenSubcontractSteps } from './subcontracting';

describe('Fremdbearbeitung', () => {
  it('hält den Werkstattauftrag bis zur vollständigen Rücknahme offen', () => {
    expect(hasOpenSubcontractSteps(['draft'])).toBe(true);
    expect(hasOpenSubcontractSteps(['issued'])).toBe(true);
    expect(hasOpenSubcontractSteps(['partial', 'completed'])).toBe(true);
    expect(hasOpenSubcontractSteps(['completed', 'cancelled'])).toBe(false);
    expect(hasOpenSubcontractSteps([])).toBe(false);
  });
  it('gibt Material nur einmal aus dem Entwurf aus', () => {
    expect(canIssue('draft')).toBe(true);
    for (const status of ['issued', 'partial', 'completed', 'cancelled']) expect(canIssue(status)).toBe(false);
  });
  it('erlaubt Wareneingang erst nach Materialausgabe', () => {
    expect(canReceive('draft')).toBe(false);
    expect(canReceive('issued')).toBe(true);
    expect(canReceive('partial')).toBe(true);
    expect(canReceive('completed')).toBe(false);
    expect(canReceive('cancelled')).toBe(false);
  });
  it('begrenzt Teilrückgaben auf die beim Lieferanten offene Menge', () => {
    expect(validReturn(3, 10, 7)).toBe(true);
    expect(validReturn(4, 10, 7)).toBe(false);
    expect(validReturn(0, 10, 7)).toBe(false);
    expect(validReturn(-1, 10, 7)).toBe(false);
    expect(validReturn(Infinity, 10, 7)).toBe(false);
  });
  it('verarbeitet Materialmengen mit Dezimalkomma', () => {
    expect(parseMaterialQuantity('2,5')).toBe(2.5);
  });
});