export interface PoCandidate {
  id: string;
  po_no: string | null;
  status: string;
  supplier_name: string | null;
  total: number | null;
}

export interface PoSuggestion extends PoCandidate {
  score: number;
  reasons: string[];
}

const norm = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/gmbh|ag|kg|co\.?|ltd|inc|&/g, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').trim();

/** Nur Rechnungen und Auftragsbestätigungen werden einer Bestellung zugeordnet. */
export const linkableToPo = (code: string | null | undefined) => code === 'invoice' || code === 'order_confirmation';

/** Bewertet offene Bestellungen: Bestellnummer im Dokument 100, Lieferantenname 50, Betrag ±2 % 20. */
export function suggestPurchaseOrders(
  doc: { extracted?: Record<string, any> | null; subject?: string | null; filename?: string | null; from_name?: string | null },
  pos: PoCandidate[],
  limit = 5,
): PoSuggestion[] {
  const x = doc.extracted || {};
  const hay = [x.po_number, doc.subject, doc.filename, x.notes].filter(Boolean).join(' ').toUpperCase();
  const vendor = norm(x.vendor || doc.from_name);
  const amount = Number(x.net_amount ?? x.total_amount);
  return pos
    .filter((p) => p.status !== 'cancelled')
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];
      if (p.po_no && hay.includes(p.po_no.toUpperCase())) { score += 100; reasons.push('Bestellnummer'); }
      const sup = norm(p.supplier_name);
      if (vendor && sup && (sup.includes(vendor) || vendor.includes(sup))) { score += 50; reasons.push('Lieferant'); }
      if (amount > 0 && p.total && Math.abs(p.total - amount) <= p.total * 0.02) { score += 20; reasons.push('Betrag'); }
      return { ...p, score, reasons };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || (a.po_no || '').localeCompare(b.po_no || ''))
    .slice(0, limit);
}
