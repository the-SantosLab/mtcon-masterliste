// Rechnungs-PDF via Overlay auf pixelgleiche Original-Vorlage.
// Nutzt pdf-lib: (1) weiße Masken über die dynamischen Zonen der Vorlage,
// (2) neue Werte an exakt ausgemessenen Koordinaten. Logo, Briefkopf und
// Footer stammen unverändert aus der Vorlage.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import templateAsset from '@/assets/invoice-template.pdf.asset.json';
import { fmt } from './renderer';
import type { RechnungData } from './generators';

// PDF-Koordinaten: origin BOTTOM-LEFT. Alle Design-Koordinaten sind "top-Y".
const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);

// ---- Runtime-Masken (weiße Rechtecke über dynamische Zonen der Vorlage) ----
// [x1, yTop1, x2, yTop2]
const MASKS_P1: [number, number, number, number][] = [
  [340, 128, 570, 152],   // "Invoice No. 18831"
  [ 45, 155, 335, 220],   // Empfänger-Block
  [445, 158, 570, 225],   // Cust.no/Contact/Phone/Fax/Email Werte
  [430, 232, 570, 252],   // Date + Page counter
  [ 45, 305, 570, 668],   // Positionen-Tabelle
  [425, 672, 570, 694],   // Total amount Wert
  [ 45, 683, 340, 702],   // Currency Notice
  [ 45, 702, 340, 722],   // Payment term Wert
];
const MASKS_P2: [number, number, number, number][] = [
  [340, 128, 570, 152],   // Invoice No.
  [430, 158, 570, 178],   // Date + Page counter
  [150, 190, 340, 220],   // Fälligkeits-Zeile
];

// ---- Feldpositionen (baseline ≈ yFromTop + size*0.8) ----
const P1 = {
  invoiceTitle: { x: 358, top: 134, size: 11 },
  recipient:    { x: 48,  top: 158, size: 10, lineHeight: 13 },
  metaValues:   { x: 456, top: 160, size: 9,  lineHeight: 12 },
  dateValue:    { x: 456, top: 233, size: 9 },
  pageValue:    { x: 505, top: 233, size: 9 },
  tableTop:     310,
  tableBottom:  660,
  rowLine:      11,
  cols: {
    dn:      48,
    article: 175,
    qty:     445,
    price:   510,
    value:   570,
  },
  totalValue:   { x: 570, top: 683, size: 10 },
  currencyLine: { x: 48,  top: 685, size: 9 },
  paymentValue: { x: 190, top: 706, size: 9 },
};
const P2 = {
  invoiceTitle: { x: 358, top: 134, size: 11 },
  dateValue:    { x: 456, top: 160, size: 9 },
  pageValue:    { x: 505, top: 160, size: 9 },
  dueLine:      { x: 155, top: 196, size: 9 },
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
  opts: { size?: number; bold?: boolean; red?: boolean; align?: 'left' | 'right' } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? fonts.bold : fonts.regular;
  const color = opts.red ? COLOR_RED : COLOR_TEXT;
  let drawX = x;
  if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: drawX,
    y: topY(yTop + size * 0.85),
    size,
    font,
    color,
  });
}

/** Rechnung als PDF-Bytes; nutzt Overlay auf Original-Vorlage. */
export async function renderInvoiceOverlay(d: RechnungData): Promise<Uint8Array> {
  const tplBytes = await loadTemplate();
  const pdf = await PDFDocument.load(tplBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const isEN = (d.language ?? 'de') === 'en';
  const pages = pdf.getPages();
  const page1 = pages[0];
  const factoringPage = pages[1];

  // 1) Masken
  mask(page1, MASKS_P1);
  if (factoringPage) mask(factoringPage, MASKS_P2);

  // 2) Werte Seite 1
  txt(page1, `${isEN ? 'Invoice No.' : 'Rechnung Nr.'} ${d.invoiceNo}`,
    P1.invoiceTitle.x, P1.invoiceTitle.top, fonts,
    { size: P1.invoiceTitle.size, bold: true });

  const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
  recipientLines.forEach((line, i) => {
    txt(page1, line, P1.recipient.x, P1.recipient.top + i * P1.recipient.lineHeight, fonts,
      { size: P1.recipient.size });
  });

  const metaLines: string[] = [];
  if (d.contact.customerNo) metaLines.push(String(d.contact.customerNo));
  if (d.contact.contactName) metaLines.push(d.contact.contactName);
  if (d.contact.phone) metaLines.push(d.contact.phone);
  if (d.contact.fax) metaLines.push(d.contact.fax);
  if (d.contact.email) metaLines.push(d.contact.email);
  metaLines.forEach((line, i) => {
    txt(page1, line, P1.metaValues.x, P1.metaValues.top + i * P1.metaValues.lineHeight, fonts,
      { size: P1.metaValues.size });
  });

  txt(page1, d.date, P1.dateValue.x, P1.dateValue.top, fonts,
    { size: P1.dateValue.size, bold: true });

  // 3) Positionen
  const unitWord = isEN ? 'Pcs' : 'Stk';
  const perUnit = (u?: string | null) => u || '1000';
  let cursorTop = P1.tableTop;

  for (const it of d.items) {
    if (cursorTop > P1.tableBottom) break; // v1: overflow-schutz
    const dnLine = it.deliveryNo
      ? `${it.deliveryNo}${it.deliveryDate ? ` ${isEN ? 'from' : 'vom'} ${fmt.date(it.deliveryDate, d.language ?? 'de')}` : ''}`
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

  // 4) Summen / Zahlung
  if (d.total != null) {
    txt(page1, fmt.currency(d.total, d.currency), P1.totalValue.x, P1.totalValue.top, fonts,
      { size: P1.totalValue.size, bold: true, align: 'right' });
  }
  if (d.currency === 'USD') {
    txt(page1, isEN ? 'Currency in USD / US$' : 'Währung in USD / US$',
      P1.currencyLine.x, P1.currencyLine.top, fonts,
      { size: P1.currencyLine.size, bold: true, red: true });
  }
  if (d.paymentTerms) {
    txt(page1, d.paymentTerms, P1.paymentValue.x, P1.paymentValue.top, fonts,
      { size: P1.paymentValue.size });
  }

  const totalPages = factoringPage ? 2 : 1;
  txt(page1, `${isEN ? 'Page' : 'Seite'} 1 ${isEN ? 'from' : 'von'} ${totalPages}`,
    P1.pageValue.x, P1.pageValue.top, fonts, { size: P1.pageValue.size });

  // 5) Seite 2 (Factoring)
  if (factoringPage) {
    txt(factoringPage, `${isEN ? 'Invoice No.' : 'Rechnung Nr.'} ${d.invoiceNo}`,
      P2.invoiceTitle.x, P2.invoiceTitle.top, fonts,
      { size: P2.invoiceTitle.size, bold: true });
    txt(factoringPage, d.date, P2.dateValue.x, P2.dateValue.top, fonts,
      { size: P2.dateValue.size, bold: true });
    txt(factoringPage, `${isEN ? 'Page' : 'Seite'} 2 ${isEN ? 'from' : 'von'} 2`,
      P2.pageValue.x, P2.pageValue.top, fonts, { size: P2.pageValue.size });
    if (d.dueDate && d.total != null) {
      const dueText = `${fmt.date(d.dueDate, d.language ?? 'de')}   ${fmt.currency(d.total, d.currency)}   ${d.invoiceNo}`;
      txt(factoringPage, dueText, P2.dueLine.x, P2.dueLine.top, fonts, { size: P2.dueLine.size });
    }
  }

  return await pdf.save();
}

/** Öffnet die Overlay-Rechnung in einem neuen Tab. */
export async function openInvoiceOverlayPdf(data: RechnungData): Promise<void> {
  const bytes = await renderInvoiceOverlay(data);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
