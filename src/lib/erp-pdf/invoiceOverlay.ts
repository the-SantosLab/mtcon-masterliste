// Rechnungs-PDF via Overlay auf pixelgleiche Original-Vorlage.
// Nutzt pdf-lib: (1) weiße Masken über alle statisch gedruckten Textzonen der
// Vorlage (Labels + Werte), (2) Labels + Werte in der gewählten Sprache
// (DE/EN) neu gezeichnet. Logo, Briefkopf, Rahmen und Footer bleiben aus der
// Vorlage unverändert.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateAsset from '@/assets/invoice-template.pdf.asset.json';
import { fmt } from './renderer';
import type { RechnungData } from './generators';

// PDF-Koordinaten: origin BOTTOM-LEFT. Alle Design-Koordinaten sind "top-Y".
const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);

// ---- Runtime-Masken (weiße Rechtecke über alle statisch bedruckten Zonen) ----
// [x1, yTop1, x2, yTop2]
const MASKS_P1: [number, number, number, number][] = [
  [340, 128, 570, 158],   // Titel "Invoice No. …"
  [ 45, 155, 335, 220],   // Empfänger-Block
  [340, 155, 570, 225],   // Meta-Labels + Werte (Cust.no/Contact/Phone/Fax/Email)
  [340, 225, 570, 252],   // Date-Label + Wert + Seitenzähler
  [ 45, 253, 570, 275],   // Intro-Zeile "we will charge you…"
  [ 45, 278, 570, 305],   // Tabellen-Header (DN no/Article No/Qty/Price/Item value)
  [ 45, 305, 570, 668],   // Positionen-Tabelle
  [340, 672, 570, 694],   // Total-Label + Wert
  [ 45, 683, 340, 702],   // Currency Notice (Label + Wert)
  [ 45, 702, 340, 722],   // Payment-term-Zeile (Label + Wert)
];
const MASKS_P2: [number, number, number, number][] = [
  [340, 128, 570, 158],   // Titel "Invoice No. …"
  [340, 155, 570, 178],   // Date-Label + Wert + Seitenzähler
  [ 45, 225, 570, 900],   // gesamter Factoring-/Hinweis-Block
];

// ---- Feldpositionen (baseline ≈ yFromTop + size*0.85) ----
const P1 = {
  invoiceTitle: { x: 358, top: 134, size: 11 },
  recipient:    { x: 86,  top: 158, size: 10, lineHeight: 13 },
  metaLabel:    { x: 358, top: 160, size: 9,  lineHeight: 12 },
  metaValue:    { x: 456, top: 160, size: 9,  lineHeight: 12 },
  dateLabel:    { x: 358, top: 233, size: 9 },
  dateValue:    { x: 456, top: 233, size: 9 },
  pageValue:    { x: 505, top: 233, size: 9 },
  intro:        { x: 48,  top: 262, size: 9 },
  headerRow:    { top: 287, size: 9 },
  tableTop:     310,
  tableBottom:  660,
  rowLine:      11,
  cols: {
    dn:      48,
    article: 175,
    qty:     360,   // right-align
    price:   470,   // right-align
    value:   560,   // right-align
  },
  totalLabel:   { x: 420, top: 683, size: 10 },
  totalValue:   { x: 560, top: 683, size: 10 },
  currencyLine: { x: 48,  top: 685, size: 9 },
  paymentLabel: { x: 48,  top: 706, size: 9 },
  paymentValue: { x: 190, top: 706, size: 9 },
};
const P2 = {
  invoiceTitle: { x: 358, top: 134, size: 11 },
  dateLabel:    { x: 342, top: 160, size: 9 },
  dateValue:    { x: 456, top: 160, size: 9 },
  pageValue:    { x: 505, top: 160, size: 9 },
  factoring:    { x: 70,  top: 232, size: 9, lineHeight: 12, width: 485 },
};

// ---- Beschriftungen DE/EN ----
type Lang = 'de' | 'en';
const L = {
  invoiceNo:     { de: 'Rechnung Nr.',     en: 'Invoice No.' },
  custNo:        { de: 'Kd.-Nr.',          en: 'Cust.no' },
  contact:       { de: 'Ansprechpartner',  en: 'Contact person' },
  phone:         { de: 'Telefon',          en: 'Phone' },
  fax:           { de: 'Fax',              en: 'Fax' },
  email:         { de: 'E-Mail',           en: 'Email' },
  date:          { de: 'Datum',            en: 'Date' },
  page:          { de: 'Seite',            en: 'Page' },
  of:            { de: 'von',              en: 'of' },
  from:          { de: 'vom',              en: 'from' },
  intro:         { de: 'wir berechnen Ihnen folgende Positionen:',
                   en: 'we will charge you the following positions:' },
  colDn:         { de: 'LS-Nr.',           en: 'DN no' },
  colArticle:    { de: 'Artikel-Nr.',      en: 'Article No' },
  colQty:        { de: 'Menge',            en: 'Qty' },
  colPrice:      { de: 'Preis',            en: 'Price' },
  colValue:      { de: 'Positionswert',    en: 'Item value' },
  total:         { de: 'Gesamtbetrag',     en: 'Total amount' },
  payment:       { de: 'Zahlungsbedingung', en: 'Payment term' },
  currencyUsd:   { de: 'Währung in USD / US$', en: 'Currency in USD / US$' },
  unitPcs:       { de: 'Stk',              en: 'Pcs' },
};
const t = (key: keyof typeof L, lang: Lang) => L[key][lang];

// ---- Factoring-Text (Seite 2) ----
const FACTORING = {
  de: [
    'Aufgrund einer Factoring-Vereinbarung sind unsere Forderungen an die SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart abgetreten. Zahlungen mit schuldbefreiender Wirkung können ausschließlich auf folgendes Konto geleistet werden:',
    '',
    'Name: Baden-Württembergische Bank',
    'IBAN: DE42 6005 0101 7482 0107 83',
    'BIC: SOLADEST600',
    '',
    'Bitte geben Sie bei der Überweisung die Kundennummer und die vollständige Rechnungsnummer ohne Leerzeichen oder Sonderzeichen, getrennt durch ein Komma, im Verwendungszweck an. Bei mehr als 5 Rechnungsnummern senden Sie bitte eine Benachrichtigung an debitoren@suedfactoring.de.',
    '',
    'Die Datenschutzhinweise der SüdFactoring GmbH finden Sie unter https://www.suedfactoring.de/Datenschutz/.',
    '',
    '',
    'Beanstandungen können nur innerhalb der folgenden 8 Tage berücksichtigt werden.',
    '',
    'Lieferung gemäß unseren allgemeinen Geschäftsbedingungen:',
    'siehe www.mtcon.eu/de/power2pcb/agb/',
    '',
    'Mit freundlichen Grüßen',
    'MTCONNECTIVITY power2pcb GmbH',
  ],
  en: [
    'Under a factoring agreement, our receivables have been transferred to SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart, Germany. Payment with debt-discharging effect can only be made to their account:',
    '',
    'Name: Baden-Württembergische Bank',
    'IBAN: DE42 6005 0101 7482 0107 83',
    'BIC: SOLADEST600',
    '',
    'When making the transfer, please state the customer number and the complete invoice number without spaces or special characters, separated by a comma, in the reference field. If there are more than 5 invoice numbers, please send a notification to debitoren@suedfactoring.de.',
    '',
    'The data protection information of SüdFactoring GmbH can be found at https://www.suedfactoring.de/Datenschutz/.',
    '',
    '',
    'Complaints can only be considered within the following 8 days.',
    '',
    'Delivery according to our general terms and conditions of trade:',
    'see www.mtcon.eu/en/power2pcb/gcs/',
    '',
    'Best regards',
    'MTCONNECTIVITY power2pcb GmbH',
  ],
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(templateAsset.url);
  if (!res.ok) throw new Error(`Rechnungs-Vorlage konnte nicht geladen werden (${res.status})`);
  return res.arrayBuffer();
}

function mask(page: PDFPage, boxes: [number, number, number, number][]) {
  for (const [x1, y1, x2, y2] of boxes) {
    page.drawRectangle({
      x: x1,
      y: topY(y2),
      width: x2 - x1,
      height: y2 - y1,
      color: WHITE,
    });
  }
}

function txt(
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  fonts: Fonts,
  opts: { size?: number; bold?: boolean; red?: boolean; align?: 'left' | 'right' | 'center' } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? fonts.bold : fonts.regular;
  const color = opts.red ? COLOR_RED : COLOR_TEXT;
  let drawX = x;
  if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(text, size);
  else if (opts.align === 'center') drawX = x - font.widthOfTextAtSize(text, size) / 2;
  page.drawText(text, {
    x: drawX,
    y: topY(yTop + size * 0.85),
    size,
    font,
    color,
  });
}

/** Bricht Text auf gegebene Breite (px) um, gibt die Zeilen zurück. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Rechnung als PDF-Bytes; nutzt Overlay auf Original-Vorlage. */
export async function renderInvoiceOverlay(d: RechnungData, opts: { demo?: boolean } = {}): Promise<Uint8Array> {
  const tplBytes = await loadTemplate();
  const pdf = await PDFDocument.load(tplBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const lang: Lang = (d.language ?? 'de') === 'en' ? 'en' : 'de';
  const pages = pdf.getPages();
  const page1 = pages[0];
  const factoringPage = pages[1];

  // 1) Masken
  mask(page1, MASKS_P1);
  if (factoringPage) mask(factoringPage, MASKS_P2);

  // 2) Titel + Meta-Labels/Werte (Seite 1)
  txt(page1, `${t('invoiceNo', lang)} ${d.invoiceNo}`,
    P1.invoiceTitle.x, P1.invoiceTitle.top, fonts,
    { size: P1.invoiceTitle.size, bold: true });

  const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
  recipientLines.forEach((line, i) => {
    txt(page1, line, P1.recipient.x, P1.recipient.top + i * P1.recipient.lineHeight, fonts,
      { size: P1.recipient.size });
  });

  // Meta: Label + Wert paarweise
  const metaRows: Array<[string, string | undefined | null]> = [
    [t('custNo', lang),  d.contact.customerNo ? String(d.contact.customerNo) : undefined],
    [t('contact', lang), d.contact.contactName],
    [t('phone', lang),   d.contact.phone],
    [t('fax', lang),     d.contact.fax],
    [t('email', lang),   d.contact.email],
  ];
  let metaRow = 0;
  for (const [label, value] of metaRows) {
    if (!value) continue;
    const y = P1.metaLabel.top + metaRow * P1.metaLabel.lineHeight;
    txt(page1, label, P1.metaLabel.x, y, fonts, { size: P1.metaLabel.size, bold: true });
    txt(page1, value, P1.metaValue.x, y, fonts, { size: P1.metaValue.size });
    metaRow++;
  }

  // Datum + Seitenzahl
  txt(page1, t('date', lang), P1.dateLabel.x, P1.dateLabel.top, fonts,
    { size: P1.dateLabel.size, bold: true });
  txt(page1, d.date, P1.dateValue.x, P1.dateValue.top, fonts,
    { size: P1.dateValue.size, bold: true });

  const totalPages = factoringPage ? 2 : 1;
  txt(page1, `${t('page', lang)} 1 ${t('of', lang)} ${totalPages}`,
    P1.pageValue.x, P1.pageValue.top, fonts, { size: P1.pageValue.size });

  // 3) Intro + Tabellen-Header
  txt(page1, t('intro', lang), P1.intro.x, P1.intro.top, fonts,
    { size: P1.intro.size });

  txt(page1, t('colDn', lang),      P1.cols.dn,      P1.headerRow.top, fonts, { size: P1.headerRow.size, bold: true });
  txt(page1, t('colArticle', lang), P1.cols.article, P1.headerRow.top, fonts, { size: P1.headerRow.size, bold: true });
  txt(page1, t('colQty', lang),     P1.cols.qty,     P1.headerRow.top, fonts, { size: P1.headerRow.size, bold: true, align: 'right' });
  txt(page1, t('colPrice', lang),   P1.cols.price,   P1.headerRow.top, fonts, { size: P1.headerRow.size, bold: true, align: 'right' });
  txt(page1, t('colValue', lang),   P1.cols.value,   P1.headerRow.top, fonts, { size: P1.headerRow.size, bold: true, align: 'right' });

  // 4) Positionen
  const unitWord = t('unitPcs', lang);
  const perUnit = (u?: string | null) => u || '1000';
  let cursorTop = P1.tableTop;

  for (const it of d.items) {
    if (cursorTop > P1.tableBottom) break;
    const dnLine = it.deliveryNo
      ? `${it.deliveryNo}${it.deliveryDate ? ` ${t('from', lang)} ${fmt.date(it.deliveryDate, lang)}` : ''}`
      : '';
    const qtyStr = it.quantity != null ? `${fmt.qty(it.quantity)} ${unitWord}` : '';
    const priceStr = it.price != null ? `${fmt.currency(it.price, d.currency)} / ${perUnit(it.unit)}` : '';
    const valueStr = it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '';

    if (dnLine) txt(page1, dnLine, P1.cols.dn, cursorTop, fonts, { size: 9 });
    if (it.artNr) txt(page1, it.artNr, P1.cols.article, cursorTop, fonts, { size: 9 });
    if (qtyStr) txt(page1, qtyStr, P1.cols.qty, cursorTop, fonts, { size: 9, align: 'right' });
    if (priceStr) txt(page1, priceStr, P1.cols.price, cursorTop, fonts, { size: 9, align: 'right' });
    if (valueStr) txt(page1, valueStr, P1.cols.value, cursorTop, fonts, { size: 9, align: 'right' });
    cursorTop += P1.rowLine;

    if (it.description) {
      txt(page1, it.description, P1.cols.article, cursorTop, fonts, { size: 9 });
      cursorTop += P1.rowLine;
    }
    for (const ex of it.extraLines ?? []) {
      txt(page1, ex, P1.cols.article, cursorTop, fonts, { size: 9 });
      cursorTop += P1.rowLine;
    }
    cursorTop += 4;
  }

  // 5) Summen / Zahlung
  if (d.total != null) {
    txt(page1, t('total', lang), P1.totalLabel.x, P1.totalLabel.top, fonts,
      { size: P1.totalLabel.size, bold: true });
    txt(page1, fmt.currency(d.total, d.currency), P1.totalValue.x, P1.totalValue.top, fonts,
      { size: P1.totalValue.size, bold: true, align: 'right' });
  }
  if (d.currency === 'USD') {
    txt(page1, t('currencyUsd', lang),
      P1.currencyLine.x, P1.currencyLine.top, fonts,
      { size: P1.currencyLine.size, bold: true, red: true });
  }
  if (d.paymentTerms) {
    txt(page1, t('payment', lang), P1.paymentLabel.x, P1.paymentLabel.top, fonts,
      { size: P1.paymentLabel.size, bold: true });
    txt(page1, d.paymentTerms, P1.paymentValue.x, P1.paymentValue.top, fonts,
      { size: P1.paymentValue.size });
  }

  // 6) Seite 2 (Factoring)
  if (factoringPage) {
    txt(factoringPage, `${t('invoiceNo', lang)} ${d.invoiceNo}`,
      P2.invoiceTitle.x, P2.invoiceTitle.top, fonts,
      { size: P2.invoiceTitle.size, bold: true });
    txt(factoringPage, t('date', lang), P2.dateLabel.x, P2.dateLabel.top, fonts,
      { size: P2.dateLabel.size, bold: true });
    txt(factoringPage, d.date, P2.dateValue.x, P2.dateValue.top, fonts,
      { size: P2.dateValue.size, bold: true });
    txt(factoringPage, `${t('page', lang)} 2 ${t('of', lang)} 2`,
      P2.pageValue.x, P2.pageValue.top, fonts, { size: P2.pageValue.size });

    // Factoring-Block in gewählter Sprache
    let y = P2.factoring.top;
    for (const para of FACTORING[lang]) {
      const lines = para === '' ? [''] : wrap(para, bold, P2.factoring.size, P2.factoring.width);
      const isRedBlock = y < P2.factoring.top + 260; // obere Hälfte ist im Original rot/fett
      for (const line of lines) {
        if (line !== '') {
          txt(factoringPage, line, P2.factoring.x, y, fonts, {
            size: P2.factoring.size,
            bold: isRedBlock,
            red: isRedBlock,
          });
        }
        y += P2.factoring.lineHeight;
      }
    }
  }

  // 7) DEMO-Wasserzeichen
  if (opts.demo) {
    for (const page of pages) {
      page.drawText('DEMO', {
        x: 90, y: 240,
        size: 180,
        font: bold,
        color: COLOR_RED,
        opacity: 0.18,
        rotate: degrees(35),
      });
      page.drawText(lang === 'en' ? 'DEMO — not legally valid' : 'DEMO — nicht rechtsgültig', {
        x: 48, y: topY(60),
        size: 8,
        font: bold,
        color: COLOR_RED,
        opacity: 0.9,
      });
    }
  }

  return await pdf.save();
}

/** Öffnet die Overlay-Rechnung in einem neuen Tab.
 *  Nutzt einen Anchor-Klick statt window.open, da Chrome / AdBlocker
 *  asynchron geöffnete Popups oft mit ERR_BLOCKED_BY_CLIENT blockieren. */
export async function openInvoiceOverlayPdf(data: RechnungData, opts: { demo?: boolean } = {}): Promise<void> {
  const bytes = await renderInvoiceOverlay(data, opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${opts.demo ? 'DEMO-' : ''}Rechnung-${data.invoiceNo || 'preview'}.pdf`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
