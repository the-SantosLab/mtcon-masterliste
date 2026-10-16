import { describe, it, expect } from 'vitest';
import { parseCsv, matchPayments } from './bankMatch';

const csv = `Buchungstag;Auftraggeber;Verwendungszweck;Betrag
01.10.2026;Müller GmbH;RE-2026-0007 danke;1.190,00
02.10.2026;Schmidt AG;Zahlung;250,00
03.10.2026;Bank;Gebühr;-5,00`;

const inv = [
  { id: 'a', invoice_no: 'RE-2026-0007', customer_name: 'Müller', open: 1190 },
  { id: 'b', invoice_no: 'RE-2026-0008', customer_name: 'Schmidt', open: 250 },
  { id: 'c', invoice_no: 'RE-2026-0009', customer_name: 'X', open: 99 },
];

describe('bankMatch', () => {
  it('parses German CSV and ignores outgoing amounts', () => {
    const t = parseCsv(csv);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ date: '2026-10-01', amount: 1190 });
  });
  it('matches by invoice number first, then by unique amount', () => {
    const m = matchPayments(parseCsv(csv), inv);
    expect(m[0].invoice?.id).toBe('a');
    expect(m[0].reason).toBe('Rechnungsnummer');
    expect(m[1].invoice?.id).toBe('b');
    expect(m[1].reason).toBe('Betrag');
  });
  it('does not guess when the amount fits several invoices', () => {
    const m = matchPayments([{ date: '2026-10-01', amount: 250, text: 'x', key: 'k' }], [...inv, { id: 'd', invoice_no: 'R9', customer_name: 'Y', open: 250 }]);
    expect(m[0].invoice).toBeNull();
  });
});
