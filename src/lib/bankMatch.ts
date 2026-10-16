// Bank statement parsing (CSV / CAMT.053) and matching of incoming payments to open invoices.
export interface BankTx { date: string; amount: number; text: string; key: string }
export interface OpenInvoice { id: string; invoice_no: string | null; customer_name: string | null; open: number }
export interface Match { tx: BankTx; invoice: OpenInvoice | null; reason: 'Rechnungsnummer' | 'Betrag' | null }

const num = (s: string) => {
  const t = s.trim().replace(/\s|€|EUR/g, '');
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};
const isoDate = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.trim().slice(0, 10);
};
const keyOf = (date: string, amount: number, text: string) => `${date}|${amount.toFixed(2)}|${text.slice(0, 80)}`;

function splitCsv(line: string, sep: string) {
  const out: string[] = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

export function parseCsv(content: string): BankTx[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const sep = (lines[0]?.split(';').length ?? 0) >= (lines[0]?.split(',').length ?? 0) ? ';' : ',';
  const hi = lines.findIndex(l => /betrag|amount/i.test(l));
  if (hi < 0) return [];
  const head = splitCsv(lines[hi], sep).map(h => h.toLowerCase());
  const find = (re: RegExp) => head.findIndex(h => re.test(h));
  const iDate = find(/buchungstag|buchungsdatum|valuta|datum|date/);
  const iAmt = find(/betrag|amount/);
  const iText = find(/verwendungszweck|purpose|beschreibung|buchungstext/);
  const iName = find(/beg(ü|ue)nstigter|auftraggeber|zahlungspflichtig|name/);
  return lines.slice(hi + 1).map(l => splitCsv(l, sep)).filter(c => c.length > iAmt).map(c => {
    const date = isoDate(c[iDate] ?? '');
    const amount = num(c[iAmt] ?? '');
    const text = [iName >= 0 ? c[iName] : '', iText >= 0 ? c[iText] : ''].filter(Boolean).join(' – ');
    return { date, amount, text, key: keyOf(date, amount, text) };
  }).filter(t => Number.isFinite(t.amount) && t.amount > 0);
}

export function parseCamt(xml: string): BankTx[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const tag = (el: Element | Document, n: string) => el.getElementsByTagNameNS('*', n)[0]?.textContent?.trim() ?? '';
  return Array.from(doc.getElementsByTagNameNS('*', 'Ntry')).filter(e => tag(e, 'CdtDbtInd') === 'CRDT').map(e => {
    const date = tag(e.getElementsByTagNameNS('*', 'BookgDt')[0] ?? e, 'Dt') || tag(e, 'Dt');
    const amount = Number(tag(e, 'Amt'));
    const text = [tag(e, 'Nm'), Array.from(e.getElementsByTagNameNS('*', 'Ustrd')).map(u => u.textContent).join(' ')].filter(Boolean).join(' – ');
    return { date, amount, text, key: keyOf(date, amount, text) };
  }).filter(t => t.amount > 0);
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function matchPayments(txs: BankTx[], invoices: OpenInvoice[]): Match[] {
  const used = new Set<string>();
  return txs.map(tx => {
    const t = norm(tx.text);
    const byNo = invoices.find(i => i.invoice_no && !used.has(i.id) && t.includes(norm(i.invoice_no)));
    if (byNo) { used.add(byNo.id); return { tx, invoice: byNo, reason: 'Rechnungsnummer' as const }; }
    const byAmt = invoices.filter(i => !used.has(i.id) && Math.abs(i.open - tx.amount) < 0.005);
    if (byAmt.length === 1) { used.add(byAmt[0].id); return { tx, invoice: byAmt[0], reason: 'Betrag' as const }; }
    return { tx, invoice: null, reason: null };
  });
}
