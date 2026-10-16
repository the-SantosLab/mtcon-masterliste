/** Normalisiert einen gescannten Code zu einer Artikelnummer. Unterstützt Klartext, GS1-Präfixe (]C1, ]Q3 …), "art:XYZ" und Links mit ?art=. */
export function parseScan(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^\][A-Za-z]\d/, '');
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const a = u.searchParams.get('art') || u.searchParams.get('art_nr');
      if (a) return a.trim();
    }
  } catch { /* kein Link */ }
  const m = s.match(/^(?:art|artikel|art_nr)\s*[:=]\s*(.+)$/i);
  return (m ? m[1] : s).trim();
}

export interface OpenPoLine { id: string; po_no: string | null; status: string; qty_ordered: number; qty_received: number; expected_at?: string | null }

/** Offene Bestellpositionen eines Artikels: nur bestellte/teilgelieferte Bestellungen mit Restmenge, älteste Lieferung zuerst. */
export function openPoLines(lines: OpenPoLine[]) {
  return lines
    .filter((l) => (l.status === 'ordered' || l.status === 'partial') && l.qty_ordered - l.qty_received > 0)
    .map((l) => ({ ...l, open: Math.round((l.qty_ordered - l.qty_received) * 1000) / 1000 }))
    .sort((a, b) => (a.expected_at || '9999').localeCompare(b.expected_at || '9999') || (a.po_no || '').localeCompare(b.po_no || ''));
}

/** Entnahme nur bis zum vorhandenen Bestand. */
export function issueAllowed(qty: number, onHand: number) {
  return qty > 0 && qty <= onHand;
}
