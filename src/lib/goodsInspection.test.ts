import { describe, it, expect } from 'vitest';
import { inspectionStage, overDelivery } from './goodsInspection';

describe('Wareneingangsprüfung', () => {
  it('ungeprüft am i-Punkt, nach Freigabe einlagern', () => {
    expect(inspectionStage('pending')).toBe('check');
    expect(inspectionStage('released')).toBe('store');
  });
  it('fehlerhafte Ware bleibt bis zur Rücksendung offen, auch eingelagert', () => {
    expect(inspectionStage('defect')).toBe('defect');
    expect(inspectionStage('defect_stored')).toBe('defect');
    expect(inspectionStage('returned')).toBe('done');
  });
  it('Überlieferung nur über der offenen Menge', () => {
    expect(overDelivery(12, 10)).toBe(2);
    expect(overDelivery(10, 10)).toBe(0);
    expect(overDelivery(4, 10)).toBe(0);
  });
});
