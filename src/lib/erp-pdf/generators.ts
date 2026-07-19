// Dokument-spezifische Generatoren. Jede Funktion nimmt ein bereits geladenes
// Datenobjekt entgegen (siehe fetch.ts) und liefert ein fertiges jsPDF.
import jsPDF from 'jspdf';
import { fmt, renderDocument, HeaderMeta, L } from './renderer';

// --- Gemeinsame Typen ---
export interface Party {
  name: string;
  lines: string[];               // Straße / PLZ Ort / Land
}
export interface ContactInfo {
  customerNo?: string | null;
  contactName?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  supplierNo?: string | null;
  vatId?: string | null;
  subject?: string | null;
}
export interface LineItem {
  pos?: number | string;
  artNr?: string | null;
  description: string;
  quantity?: number | null;
  unit?: string | null;
  price?: number | null;
  positionValue?: number | null;
  extraLines?: string[];         // Zusatzangaben unter der Position
}

function buildMeta(
  title: string, no: string, date: string, party: Party, contact: ContactInfo,
  lang: L, intro?: string, dateLabel = 'Datum', pageLabel = 'Seite', ofWord = 'von',
): HeaderMeta {
  const rows: { label: string; value: string }[] = [];
  if (contact.customerNo) rows.push({ label: lang === 'en' ? 'Cust.no' : 'Kunden-Nr.', value: contact.customerNo });
  if (contact.contactName) rows.push({ label: lang === 'en' ? 'Contact person' : 'Ansprechpartner', value: contact.contactName });
  if (contact.phone) rows.push({ label: lang === 'en' ? 'Phone' : 'Telefon', value: contact.phone });
  if (contact.fax) rows.push({ label: 'Fax', value: contact.fax });
  if (contact.email) rows.push({ label: lang === 'en' ? 'Email' : 'E-Mail', value: contact.email });
  if (contact.supplierNo) rows.push({ label: 'Lieferanten-Nr.', value: contact.supplierNo });
  if (contact.vatId) rows.push({ label: 'USt-ID-Nr.', value: contact.vatId });
  if (contact.subject) rows.push({ label: 'Betreff', value: contact.subject });

  return {
    docTitle: title, docNo: no,
    metaRows: rows,
    recipient: [party.name, ...party.lines],
    senderLine: 'MTCONNECTIVITY power2pcb GmbH  Rathausgäßle 5  74676 Niedernhall',
    intro, date, dateLabel, pageLabel, pageOfWord: ofWord, language: lang,
  };
}

function itemsToRows(items: LineItem[], currency: string): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const it of items) {
    rows.push([
      it.pos ?? '',
      it.artNr ?? '',
      it.description,
      it.quantity != null ? `${fmt.qty(it.quantity)}${it.unit ? ' ' + it.unit : ''}` : '',
      it.price != null ? `${fmt.currency(it.price, currency)}${it.unit ? ' / ' + it.unit : ''}` : '',
      it.positionValue != null ? fmt.currency(it.positionValue, currency) : '',
    ]);
    for (const ex of it.extraLines ?? []) {
      rows.push(['', ex, '', '', '', '']);
    }
  }
  return rows;
}

// -------- Angebot --------
export interface AngebotData {
  offerNo: string; date: string; validUntil?: string | null;
  party: Party; contact: ContactInfo; items: LineItem[];
  currency: string; deliveryTerms?: string; paymentTerms?: string; notes?: string;
}
export function buildAngebotPdf(d: AngebotData): jsPDF {
  const meta = buildMeta('Angebot Nr.', d.offerNo, d.date, d.party, d.contact, 'de',
    'Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen gemäß unseren allgemeinen Verkaufsbedingungen wie folgt an:\nsiehe www.mtcon.eu/power2pcb/avb/');
  const conds: { label: string; value: string }[] = [];
  if (d.deliveryTerms) conds.push({ label: 'Lieferung', value: d.deliveryTerms });
  if (d.paymentTerms) conds.push({ label: 'Zahlungsbedingungen', value: d.paymentTerms });
  if (d.validUntil) conds.push({ label: 'Gültigkeit bis', value: fmt.date(d.validUntil) });
  if (d.notes) conds.push({ label: 'Anmerkungen', value: d.notes });
  return renderDocument({
    meta,
    table: {
      head: ['Pos', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Preis', 'Positionswert'],
      body: itemsToRows(d.items, d.currency),
      columnStyles: {
        0: { cellWidth: 10 }, 1: { cellWidth: 26 },
        3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      conditions: conds,
      footNote:
        'Bitte beachten Sie, dass die angegebenen Preise ausschließlich für eine verbindliche Mindestabnahme der jeweils angebotenen Menge ab Auftragserteilung gelten, sofern nichts anderes vereinbart ist. Die angegebenen Lieferzeiten können zum Bestellzeitpunkt abweichen und sind unverbindlich.',
      closing: 'Wir würden uns freuen, wenn Ihnen unser Angebot zusagt.\nMit freundlichen Grüßen',
    },
  });
}

// -------- Auftragsbestätigung --------
export interface ABData {
  abNo: string; date: string; deliveryDate?: string | null;
  party: Party; contact: ContactInfo; items: LineItem[]; currency: string;
  subtotal: number; tax: number; total: number; taxRate?: number;
  deliveryTerms?: string; paymentTerms?: string; shipTo?: string[];
  isFrame?: boolean;
}
export function buildABPdf(d: ABData): jsPDF {
  const meta = buildMeta('Auftragsbestätigung Nr.', d.abNo, d.date, d.party, d.contact, 'de',
    'Wir bestätigen Ihren Auftrag gerne zu unseren Verkaufsbedingungen:\nsiehe www.mtcon.eu/power2pcb/avb/');
  const conds: { label: string; value: string }[] = [];
  if (d.deliveryTerms) conds.push({ label: 'Lieferung', value: d.deliveryTerms });
  if (d.paymentTerms) conds.push({ label: 'Zahlung', value: d.paymentTerms });
  if (d.shipTo?.length) conds.push({ label: 'Lieferung an', value: d.shipTo.join('\n') });

  return renderDocument({
    meta,
    table: {
      head: ['Pos', 'Art.-Nr.', 'Termin', 'Menge', 'Preis', 'Positionswert'],
      body: d.items.map(it => [
        it.pos ?? '',
        it.artNr ?? '',
        d.deliveryDate ? fmt.date(d.deliveryDate) : '',
        it.quantity != null ? `${fmt.qty(it.quantity)}${it.unit ? ' ' + it.unit : ''}` : '',
        it.price != null ? `${fmt.currency(it.price, d.currency)} / ${it.unit || '1000'}` : '',
        it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '',
      ]),
      columnStyles: {
        0: { cellWidth: 10 }, 1: { cellWidth: 26 }, 2: { cellWidth: 22 },
        3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      totals: [
        { label: 'Nettobetrag', value: fmt.currency(d.subtotal, d.currency) },
        { label: `MwSt ${(d.taxRate ?? 19).toFixed(2).replace('.', ',')}%`, value: fmt.currency(d.tax, d.currency) },
        { label: 'Gesamtbetrag', value: fmt.currency(d.total, d.currency), bold: true },
      ],
      conditions: conds,
      legend: d.isFrame ? 'R=Rahmen A=Abruf F=Feinabruf V=Vorschau M=Materialfreigabe' : undefined,
      footNote:
        'Bitte beachten Sie, dass die angegebenen Liefertermine unverbindlich und nicht regressfähig sind. Bei Terminverschiebungen behalten wir uns vor, Ihnen eine geänderte Auftragsbestätigung zu senden. Alle vorherigen Auftragsbestätigungen verlieren hiermit ihre Gültigkeit. Bis zur Bezahlung aller Ansprüche aus der Geschäftsverbindung behält sich der Verkäufer das Eigentum an seinen Liefersachen vor. Reklamationen können nur innerhalb 8 Tagen berücksichtigt werden.',
      closing: 'Mit freundlichen Grüßen',
    },
  });
}

// -------- Bestellung (Purchase Order an Lieferant) --------
export interface BestellungData {
  poNo: string; date: string; expected?: string | null;
  party: Party; contact: ContactInfo; items: LineItem[]; currency: string;
  notes?: string; isFrame?: boolean;
}
export function buildBestellungPdf(d: BestellungData): jsPDF {
  const meta = buildMeta('Bestellung Nr.', d.poNo, d.date, d.party, d.contact, 'de',
    'Wir bestellen bei Ihnen zu unseren Einkaufsbedingungen:\nsiehe www.mtcon.eu/power2pcb/aeb/');
  const conds: { label: string; value: string }[] = [];
  if (d.expected) conds.push({ label: 'Wunschtermin', value: fmt.date(d.expected) });
  if (d.notes) conds.push({ label: 'Anmerkungen', value: d.notes });
  return renderDocument({
    meta,
    table: {
      head: ['Pos', 'Art.-Nr.', 'Bezeichnung', 'Menge', 'Preis', 'Positionswert'],
      body: itemsToRows(d.items, d.currency),
      columnStyles: {
        0: { cellWidth: 10 }, 1: { cellWidth: 26 },
        3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      conditions: conds,
      legend: d.isFrame ? 'R=Rahmen A=Abruf F=Feinabruf V=Vorschau M=Materialfreigabe' : undefined,
      closing: 'Mit freundlichen Grüßen',
    },
  });
}

// -------- Lieferschein / Rücklieferschein --------
export interface LieferscheinData {
  deliveryNo: string; date: string; orderNo?: string | null;
  party: Party; contact: ContactInfo;
  items: (LineItem & { orderNo?: string })[];
  deliveryTerms?: string; packages?: number; notes?: string;
  isReturn?: boolean;
}
export function buildLieferscheinPdf(d: LieferscheinData): jsPDF {
  const title = d.isReturn ? 'Rücklieferschein Nr.' : 'Lieferschein Nr.';
  const intro = d.isReturn
    ? 'Wir senden Ihnen folgende Positionen zurück gemäß unseren allgemeinen Geschäftsbedingungen:\nsiehe www.mtcon.eu/power2pcb/avb/'
    : 'Wir liefern Ihnen folgende Positionen gemäß unseren allgemeinen Geschäftsbedingungen:\nsiehe www.mtcon.eu/power2pcb/avb/';
  const meta = buildMeta(title, d.deliveryNo, d.date, d.party, d.contact, 'de', intro);

  const body: (string | number)[][] = [];
  for (const it of d.items) {
    body.push([
      it.orderNo ?? d.orderNo ?? '',
      it.pos ?? '',
      it.artNr ?? '',
      it.description + (it.extraLines?.length ? '\n' + it.extraLines.join('\n') : ''),
      it.quantity != null ? `${fmt.qty(it.quantity)}${it.unit ? ' ' + it.unit : ''}` : '',
    ]);
  }

  const conds: { label: string; value: string }[] = [];
  if (d.deliveryTerms) conds.push({ label: 'Lieferung', value: d.deliveryTerms });
  if (d.packages != null) conds.push({ label: 'Anzahl Packstücke', value: String(d.packages) });
  if (d.notes) conds.push({ label: 'Anmerkungen', value: d.notes });

  return renderDocument({
    meta,
    table: {
      head: ['Auftr-Nr', 'Pos', 'Artikel-Nr', 'Bestelldaten', 'Menge'],
      body,
      columnStyles: {
        0: { cellWidth: 22 }, 1: { cellWidth: 12 }, 2: { cellWidth: 30 },
        4: { cellWidth: 26, halign: 'right' },
      },
      conditions: conds,
      closing: 'Mit freundlichen Grüßen',
    },
  });
}

// -------- Rechnung DE / EN --------
export interface RechnungData {
  invoiceNo: string; date: string; dueDate?: string | null;
  party: Party; contact: ContactInfo; items: LineItem[]; currency: string;
  subtotal: number; tax: number; total: number; taxRate?: number;
  paymentTerms?: string; language?: L; factoringNote?: boolean;
}
export function buildRechnungPdf(d: RechnungData): jsPDF {
  const lang: L = d.language ?? 'de';
  const isEN = lang === 'en';
  const meta = buildMeta(
    isEN ? 'Invoice No.' : 'Rechnung Nr.',
    d.invoiceNo, d.date, d.party, d.contact, lang,
    isEN ? 'we will charge you the following positions:' : 'wir berechnen Ihnen folgende Positionen:',
    isEN ? 'Date' : 'Datum', isEN ? 'Page' : 'Seite', isEN ? 'from' : 'von',
  );

  const totals = [
    { label: isEN ? 'Net amount' : 'Nettobetrag', value: fmt.currency(d.subtotal, d.currency) },
    { label: `${isEN ? 'VAT' : 'MwSt'} ${(d.taxRate ?? (d.currency === 'USD' ? 0 : 19)).toFixed(2).replace('.', ',')}%`, value: fmt.currency(d.tax, d.currency) },
    { label: isEN ? 'Total amount' : 'Gesamtbetrag', value: fmt.currency(d.total, d.currency), bold: true },
  ];
  const conds: { label: string; value: string }[] = [];
  if (d.paymentTerms) conds.push({ label: isEN ? 'Payment term' : 'Zahlung', value: d.paymentTerms });
  if (d.dueDate) conds.push({ label: isEN ? 'Due date' : 'Fällig am', value: fmt.date(d.dueDate, lang) });

  return renderDocument({
    meta,
    table: {
      head: [
        isEN ? 'DN no' : 'LS-Nr',
        isEN ? 'Article No' : 'Art.-Nr.',
        isEN ? 'Description' : 'Bezeichnung',
        isEN ? 'Qty' : 'Menge',
        isEN ? 'Price' : 'Preis',
        isEN ? 'Item value' : 'Positionswert',
      ],
      body: d.items.map(it => [
        it.pos ?? '',
        it.artNr ?? '',
        it.description + (it.extraLines?.length ? '\n' + it.extraLines.join('\n') : ''),
        it.quantity != null ? `${fmt.qty(it.quantity)}${it.unit ? ' ' + it.unit : ''}` : '',
        it.price != null ? `${fmt.currency(it.price, d.currency)} / ${it.unit || '1000'}` : '',
        it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '',
      ]),
      columnStyles: {
        0: { cellWidth: 18 }, 1: { cellWidth: 26 },
        3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
      },
      totals,
      conditions: conds,
      footNote: d.factoringNote
        ? (isEN
          ? 'Under a factoring agreement, our receivables have been transferred to SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart, Germany. Payment with debt-discharging effect can only be made to their account: BW-Bank, IBAN: DE42 6005 0101 7482 0107 83, BIC: SOLADEST600.'
          : 'Unsere Forderungen sind im Rahmen eines Factoring-Vertrages an die SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart abgetreten. Zahlung mit schuldbefreiender Wirkung kann nur auf deren Konto erfolgen: BW-Bank, IBAN: DE42 6005 0101 7482 0107 83, BIC: SOLADEST600.')
        : undefined,
      closing: isEN ? 'Best regards' : 'Mit freundlichen Grüßen',
    },
  });
}
