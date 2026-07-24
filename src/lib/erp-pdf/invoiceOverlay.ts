// Rechnungs-PDF via Overlay auf pixelgleiche Original-Vorlage.
// Nutzt pdf-lib, um in eine Kopie des Template-PDFs die dynamischen Werte
// (Empfänger, Kunden-Nr., Datum, Positionen, Summe, Factoring-Werte) an
// exakt ausgemessenen Koordinaten einzuzeichnen. Logo, Briefkopf und
// Footer stammen unverändert aus der Vorlage.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import templateAsset from '@/assets/invoice-template.pdf.asset.json';
import { fmt } from './renderer';
import type { RechnungData } from './generators';

// PDF-Koordinaten: origin BOTTOM-LEFT, Y wächst nach oben.
// Alle Design-Koordinaten unten sind "top-Y" (von oben gemessen); umgerechnet via topY().
const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);

// ---- Feld-Mapping (in "from top" pts) ----
const P1 = {
  invoiceTitle: { x: 370, top: 142, size: 11, bold: true },
  recipient:    { x: 48,  top: 172, size: 10, lineHeight: 13 },
  metaValues:   { x: 456, top: 172, size: 9,  lineHeight: 12 },  // Cust.no, Contact, Phone, Fax, Email
  dateValue:    { x: 456, top: 248, size: 9,  bold: true },
  pageValue:    { x: 520, top: 248, size: 9 },
  // Items table
  table: {
    top: 310,
    bottom: 660,
    lineHeight: 11,
    cols: {
      dn:      { x: 48,  align: 'left'  as const, width: 100 },
      article: { x: 175, align: 'left'  as const, width: 245 },
      qty:     { x: 445, align: 'right' as const },
      price:   { x: 510, align: 'right' as const },
      value:   { x: 570, align: 'right' as const },
    },
  },
  totalValue:    { x: 570, top: 684, size: 10, bold: true, align: 'right' as const },
  currencyLine:  { x: 48,  top: 695, size: 9,  bold: true, color: 'red' as const },
  paymentValue:  { x: 190, top: 715, size: 9 },
};
const P2 = {
  invoiceTitle: { x: 370, top: 142, size: 11, bold: true },
  dateValue:    { x: 456, top: 174, size: 9,  bold: true },
  pageValue:    { x: 520, top: 174, size: 9 },
  dueLine:      { x: 155, top: 208, size: 9 },  // "dd.mm.yyyy  1.234,56 $  xxx"
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(templateAsset.url);
  if (!res.ok) throw new Error(`Template konnte nicht geladen werden (${res.status})`);
  return res.arrayBuffer();
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  opts: { size?: number; bold?: boolean; color?: 'text' | 'red'; align?: 'left' | 'right' } & { fonts: Fonts },
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? opts.fonts.bold : opts.fonts.regular;
  const color = opts.color === 'red' ? COLOR_RED : COLOR_TEXT;
  let drawX = x;
  if (opts.align === 'right') {
    const w = font.widthOfTextAtSize(text, size);
    drawX = x - w;
  }
  page.drawText(text, {
    x: drawX,
    y: topY(yTop) - size * 0.8, // Baseline unter yTop
    size,
    font,
    color,
  });
}

function drawTextLines(
  page: PDFPage,
  lines: string[],
  x: number,
  startTop: number,
  lineHeight: number,
  fonts: Fonts,
  opts: { size?: number; bold?: boolean } = {},
) {
  lines.forEach((line, i) => {
    drawText(page, line, x, startTop + i * lineHeight, { ...opts, fonts });
  });
}

/**
 * Erzeugt eine Rechnung als PDF, indem die Original-Vorlage geladen und
 * die dynamischen Werte per Overlay eingezeichnet werden.
 */
export async function renderInvoiceOverlay(d: RechnungData): Promise<Uint8Array> {
  const tplBytes = await loadTemplate();
  const pdf = await PDFDocument.load(tplBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const isEN = (d.language ?? 'de') === 'en';
  const pages = pdf.getPages();
  // Vorlage hat 2 Seiten. Bei Überlauf klonen wir Seite 1 als Zwischenseite.
  let page1 = pages[0];
  const factoringPage = pages[1]; // bleibt letzte Seite mit Factoring-Block

  // --- Header Seite 1 ---
  drawText(page1, `${isEN ? 'Invoice No.' : 'Rechnung Nr.'} ${d.invoiceNo}`,
    P1.invoiceTitle.x, P1.invoiceTitle.top,
    { size: P1.invoiceTitle.size, bold: true, fonts });

  const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
  drawTextLines(page1, recipientLines, P1.recipient.x, P1.recipient.top, P1.recipient.lineHeight, fonts,
    { size: P1.recipient.size });

  const metaLines: string[] = [];
  if (d.contact.customerNo) metaLines.push(String(d.contact.customerNo));
  if (d.contact.contactName) metaLines.push(d.contact.contactName);
  if (d.contact.phone) metaLines.push(d.contact.phone);
  if (d.contact.fax) metaLines.push(d.contact.fax);
  if (d.contact.email) metaLines.push(d.contact.email);
  drawTextLines(page1, metaLines, P1.metaValues.x, P1.metaValues.top, P1.metaValues.lineHeight, fonts,
    { size: P1.metaValues.size });

  drawText(page1, d.date, P1.dateValue.x, P1.dateValue.top,
    { size: P1.dateValue.size, bold: true, fonts });

  // --- Positionen (Seite 1) ---
  const unitWord = isEN ? 'Pcs' : 'Stk';
  const perUnit = (u?: string | null) => u || '1000';
  const T = P1.table;
  let cursorTop = T.top;

  const drawRow = (row: {
    dn?: string; art?: string; desc?: string;
    qty?: string; price?: string; value?: string;
    isSub?: boolean;
  }, page: PDFPage) => {
    const size = 9;
    if (row.dn) drawText(page, row.dn, T.cols.dn.x, cursorTop, { size, fonts, bold: row.isSub });
    if (row.art) drawText(page, row.art, T.cols.article.x, cursorTop, { size, fonts, bold: row.isSub });
    if (row.desc) drawText(page, row.desc, T.cols.article.x, cursorTop, { size, fonts });
    if (row.qty) drawText(page, row.qty, T.cols.qty.x, cursorTop, { size, fonts, align: 'right' });
    if (row.price) drawText(page, row.price, T.cols.price.x, cursorTop, { size, fonts, align: 'right' });
    if (row.value) drawText(page, row.value, T.cols.value.x, cursorTop, { size, fonts, align: 'right' });
  };

  for (const it of d.items) {
    // DN-Zelle
    const dnLine = it.deliveryNo
      ? `${it.deliveryNo}${it.deliveryDate ? ` ${isEN ? 'from' : 'vom'} ${fmt.date(it.deliveryDate, d.language ?? 'de')}` : ''}`
      : '';
    // Beschreibung: art_nr + description + extraLines
    const artLine = it.artNr || '';
    const descLine = it.description || '';
    const qtyStr = it.quantity != null ? `${fmt.qty(it.quantity)} ${unitWord}` : '';
    const priceStr = it.price != null ? `${fmt.currency(it.price, d.currency)} / ${perUnit(it.unit)}` : '';
    const valueStr = it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '';

    // Kopfzeile der Position
    drawRow({ dn: dnLine, art: artLine, qty: qtyStr, price: priceStr, value: valueStr }, page1);
    cursorTop += T.lineHeight;
    if (descLine) {
      drawRow({ desc: descLine }, page1);
      cursorTop += T.lineHeight;
    }
    for (const ex of it.extraLines ?? []) {
      drawRow({ desc: ex }, page1);
      cursorTop += T.lineHeight;
    }
    cursorTop += 4; // Positionsabstand

    if (cursorTop > T.bottom) {
      // Overflow: aktuell nur warnen (Erste Iteration). Weitere Zeilen werden abgeschnitten.
      // TODO: Zwischenseite per copyPages(page1) einfügen.
      break;
    }
  }

  // --- Summen / Zahlung ---
  if (d.total != null) {
    drawText(page1, fmt.currency(d.total, d.currency), P1.totalValue.x, P1.totalValue.top,
      { size: P1.totalValue.size, bold: true, align: 'right', fonts });
  }
  if (d.currency === 'USD') {
    drawText(page1, isEN ? 'Currency in USD / US$' : 'Währung in USD / US$',
      P1.currencyLine.x, P1.currencyLine.top,
      { size: P1.currencyLine.size, bold: true, color: 'red', fonts });
  }
  if (d.paymentTerms) {
    drawText(page1, d.paymentTerms, P1.paymentValue.x, P1.paymentValue.top,
      { size: P1.paymentValue.size, fonts });
  }

  // --- Seite 2 (Factoring) ---
  if (factoringPage) {
    drawText(factoringPage, `${isEN ? 'Invoice No.' : 'Rechnung Nr.'} ${d.invoiceNo}`,
      P2.invoiceTitle.x, P2.invoiceTitle.top,
      { size: P2.invoiceTitle.size, bold: true, fonts });
    drawText(factoringPage, d.date, P2.dateValue.x, P2.dateValue.top,
      { size: P2.dateValue.size, bold: true, fonts });
    drawText(factoringPage, `${isEN ? 'Page' : 'Seite'} 2 ${isEN ? 'from' : 'von'} 2`,
      P2.pageValue.x, P2.pageValue.top,
      { size: P2.pageValue.size, fonts });

    // Optional: Fälligkeits-Zeile "dd.mm.yyyy  1.234,56 $  Rechnungs-Nr."
    if (d.dueDate) {
      const dueText = `${fmt.date(d.dueDate, d.language ?? 'de')}   ${fmt.currency(d.total, d.currency)}   ${d.invoiceNo}`;
      drawText(factoringPage, dueText, P2.dueLine.x, P2.dueLine.top,
        { size: P2.dueLine.size, fonts });
    }

    // Seite-1-Counter setzen wir passend nachträglich
    drawText(page1, `${isEN ? 'Page' : 'Seite'} 1 ${isEN ? 'from' : 'von'} 2`,
      P1.pageValue.x, P1.pageValue.top,
      { size: P1.pageValue.size, fonts });
  } else {
    drawText(page1, `${isEN ? 'Page' : 'Seite'} 1 ${isEN ? 'from' : 'von'} 1`,
      P1.pageValue.x, P1.pageValue.top,
      { size: P1.pageValue.size, fonts });
  }

  return await pdf.save();
}

/** Öffnet die Overlay-Rechnung in einem neuen Tab. */
export async function openInvoiceOverlayPdf(data: RechnungData): Promise<void> {
  const bytes = await renderInvoiceOverlay(data);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // URL wird bewusst nicht sofort revoked, damit der neue Tab sie laden kann.
}
