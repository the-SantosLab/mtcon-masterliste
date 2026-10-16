import { describe, it, expect } from 'vitest';
import { parseScan, openPoLines, issueAllowed } from './scan';

describe('scan', () => {
  it('liest Artikelnummer aus Klartext, GS1-Präfix, art:-Code und Link', () => {
    expect(parseScan(' 01.1.0005.B ')).toBe('01.1.0005.B');
    expect(parseScan(']C101.1.0005.B')).toBe('01.1.0005.B');
    expect(parseScan('art:01.1.0005.B')).toBe('01.1.0005.B');
    expect(parseScan('https://mtcon.kscommand.com/scan?art=01.1.0005.B')).toBe('01.1.0005.B');
  });
  it('nur offene Restmengen bestellter Bestellungen, früheste zuerst', () => {
    const r = openPoLines([
      { id: 'a', po_no: 'PO-2', status: 'ordered', qty_ordered: 10, qty_received: 4, expected_at: '2026-11-01' },
      { id: 'b', po_no: 'PO-1', status: 'partial', qty_ordered: 5, qty_received: 2, expected_at: '2026-10-20' },
      { id: 'c', po_no: 'PO-3', status: 'ordered', qty_ordered: 5, qty_received: 5 },
      { id: 'd', po_no: 'PO-4', status: 'cancelled', qty_ordered: 5, qty_received: 0 },
      { id: 'e', po_no: 'PO-5', status: 'draft', qty_ordered: 5, qty_received: 0 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'a']);
    expect(r[1].open).toBe(6);
  });
  it('Entnahme höchstens bis zum Bestand', () => {
    expect(issueAllowed(3, 3)).toBe(true);
    expect(issueAllowed(3.5, 3)).toBe(false);
    expect(issueAllowed(0, 3)).toBe(false);
  });
});
