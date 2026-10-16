import { describe, it, expect } from 'vitest';
import { suggestPurchaseOrders, linkableToPo } from './inboxPoMatch';

const pos = [
  { id: '1', po_no: 'PO-2026-0012', status: 'ordered', supplier_name: 'Müller GmbH', total: 1000 },
  { id: '2', po_no: 'PO-2026-0013', status: 'ordered', supplier_name: 'Schmidt AG', total: 500 },
  { id: '3', po_no: 'PO-2026-0014', status: 'cancelled', supplier_name: 'Müller GmbH', total: 1000 },
];

describe('inboxPoMatch', () => {
  it('nur Rechnung und Auftragsbestätigung sind zuordenbar', () => {
    expect(linkableToPo('invoice')).toBe(true);
    expect(linkableToPo('order_confirmation')).toBe(true);
    expect(linkableToPo('order')).toBe(false);
  });
  it('Bestellnummer im Dokument gewinnt vor Lieferant', () => {
    const r = suggestPurchaseOrders({ extracted: { po_number: 'PO-2026-0013', vendor: 'Müller' } }, pos);
    expect(r[0].id).toBe('2');
    expect(r[0].score).toBe(100);
  });
  it('stornierte Bestellungen werden nie vorgeschlagen', () => {
    const r = suggestPurchaseOrders({ extracted: { vendor: 'Müller GmbH', total_amount: 1000 } }, pos);
    expect(r.map((p) => p.id)).toEqual(['1']);
    expect(r[0].score).toBe(70);
  });
  it('ohne Treffer keine Vorschläge', () => {
    expect(suggestPurchaseOrders({ extracted: { vendor: 'Unbekannt' } }, pos)).toEqual([]);
  });
});
