// Bestellung (PO an Lieferant) via Overlay auf pixelgleiche Original-Vorlage.
// Layout analog zum Angebot; Kopf-Meta enthält Lieferanten-Nr / Bearbeiter etc.
// Kein Totals-Block.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateAsset from '@/assets/purchase-template.pdf.asset.json';
import { fmt } from './renderer';
import type { BestellungData } from './generators';

const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);

const MASKS_P1: [number, number, number, number][] = [
  [340, 128, 570, 158],
  [ 45, 155, 335, 235],
  [340, 155, 570, 235],
  [340, 235, 570, 260],
  [ 45, 253, 570, 305],
  [ 45, 305, 570, 330],
  [ 45, 330, 570, 700],
  [ 45, 700, 570, 760],
];
const MASKS_PX: [number, number, number, number][] = [
  [340, 128, 570, 158],
  [ 45, 155, 570, 260],
  [ 45, 253, 570, 305],
  [ 45, 305, 570, 330],
  [ 45, 330, 570, 700],
  [ 45, 700, 570, 760],
];

const P = {
  title:      { x: 358, top: 134, size: 11 },
  recipient:  { x: 71,  top: 158, size: 10, lineHeight: 13 },
  metaLabel:  { x: 358, top: 160, size: 9,  lineHeight: 12 },
  metaValue:  { x: 456, top: 160, size: 9,  lineHeight: 12 },
  dateLabel:  { x: 358, top: 240, size: 9 },
  dateValue:  { x: 456, top: 240, size: 9 },
  pageValue:  { x: 505, top: 240, size: 9 },
  intro:      { x: 66,  top: 262, size: 9, lineHeight: 12 },
  headerRow:  { top: 312, size: 9 },
  tableTop:   328,
  tableBottom: 680,
  rowLine:    11,
  cols: {
    pos:     66,
    article: 100,
    termin:  225,
    menge:   360,
    preis:   455,
    value:   560,
  },
  condLabel: { x: 66,  size: 9, lineHeight: 14 },
  condValue: { x: 165, size: 9, lineHeight: 14 },
  closing:   { x: 66, top: 740, size: 9, lineHeight: 12 },
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(templateAsset.url);
  if (!res.ok) throw new Error(`Bestellungs-Vorlage konnte nicht geladen werden (${res.status})`);
  return res.arrayBuffer();
}

function mask(page: PDFPage, boxes: [number, number, number, number][]) {
  for (const [x1, y1, x2, y2] of boxes) {
    page.drawRectangle({ x: x1, y: topY(y2), width: x2 - x1, height: y2 - y1, color: WHITE });
  }
}

function txt(
  page: PDFPage, text: string, x: number, yTop: number, fonts: Fonts,
  opts: { size?: number; bold?: boolean; red?: boolean; align?: 'left' | 'right' | 'center' } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? fonts.bold : fonts.regular;
  const color = opts.red ? COLOR_RED : COLOR_TEXT;
  let drawX = x;
  if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(text, size);
  else if (opts.align === 'center') drawX = x - font.widthOfTextAtSize(text, size) / 2;
  page.drawText(text, { x: drawX, y: topY(yTop + size * 0.85), size, font, color });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

interface PosBlock {
  header: { pos: string; artNr: string; termin: string; qty: string; price: string; value: string };
  descriptionLines: string[];
  extraLines: string[];
  height: number;
}

export async function renderPurchaseOverlay(
  d: BestellungData,
  opts: { demo?: boolean } = {},
): Promise<Uint8Array> {
  const tplBytes = await loadTemplate();
  const tplDoc = await PDFDocument.load(tplBytes);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const beschWidth = P.cols.value - 20 - P.cols.article;
  const blocks: PosBlock[] = d.items.map((it, idx) => {
    const posNo = it.pos != null && it.pos !== '' ? String(it.pos) : String((idx + 1) * 10);
    const qtyStr = it.quantity != null ? `${fmt.qty(it.quantity)} ${it.unit || 'ST'}` : '';
    const priceStr = it.price != null
      ? `${fmt.currency(it.price, d.currency)}${it.unit && it.unit !== 'ST' ? ` / ${it.unit}` : ' / 1000'}` : '';
    const valueStr = it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '';
    const descLines: string[] = [];
    if (it.description) for (const l of it.description.split('\n')) descLines.push(...wrap(l, regular, 9, beschWidth));
    const extraLines: string[] = [];
    for (const ex of it.extraLines || []) for (const l of String(ex).split('\n')) extraLines.push(...wrap(l, regular, 9, beschWidth));
    const height = (1 + descLines.length + extraLines.length) * P.rowLine + 6;
    return {
      header: {
        pos: posNo, artNr: it.artNr || '',
        termin: d.expected ? fmt.date(d.expected) : '',
        qty: qtyStr, price: priceStr, value: valueStr,
      },
      descriptionLines: descLines, extraLines, height,
    };
  });

  const usable = P.tableBottom - P.tableTop;
  const pagesOfBlocks: PosBlock[][] = [];
  let current: PosBlock[] = []; let used = 0;
  for (const b of blocks) {
    if (used + b.height > usable && current.length) { pagesOfBlocks.push(current); current = []; used = 0; }
    current.push(b); used += b.height;
  }
  if (current.length) pagesOfBlocks.push(current);
  if (pagesOfBlocks.length === 0) pagesOfBlocks.push([]);
  const totalPages = pagesOfBlocks.length;

  const drawnPages: PDFPage[] = [];
  for (let i = 0; i < totalPages; i++) {
    const [copied] = await pdf.copyPages(tplDoc, [0]);
    pdf.addPage(copied);
    drawnPages.push(copied);
  }

  for (let i = 0; i < totalPages; i++) {
    const page = drawnPages[i];
    const isFirst = i === 0;
    const isLast = i === totalPages - 1;
    mask(page, isFirst ? MASKS_P1 : MASKS_PX);

    txt(page, `Bestellung Nr. ${d.poNo}`, P.title.x, P.title.top, fonts,
      { size: P.title.size, bold: true });

    txt(page, 'Bestelldatum', P.dateLabel.x, P.dateLabel.top, fonts, { size: P.dateLabel.size, bold: true });
    txt(page, d.date, P.dateValue.x, P.dateValue.top, fonts, { size: P.dateValue.size, bold: true });
    txt(page, `Seite ${i + 1} von ${totalPages}`, P.pageValue.x, P.pageValue.top, fonts, { size: P.pageValue.size });

    if (isFirst) {
      const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
      recipientLines.forEach((line, li) => {
        txt(page, line, P.recipient.x, P.recipient.top + li * P.recipient.lineHeight, fonts,
          { size: P.recipient.size });
      });

      const metaRows: Array<[string, string | undefined | null]> = [
        ['Lieferanten-Nr',  d.contact.supplierNo || (d.contact.customerNo ? String(d.contact.customerNo) : undefined)],
        ['Bearbeiter',      d.contact.contactName],
        ['Telefon',         d.contact.phone],
        ['Fax',             d.contact.fax],
        ['Email',           d.contact.email],
        ['Bearbeiter',      'Bestellungen'],
        ['Betreff',         d.contact.subject],
      ];
      let row = 0;
      for (const [label, value] of metaRows) {
        if (!value) continue;
        const y = P.metaLabel.top + row * P.metaLabel.lineHeight;
        txt(page, label, P.metaLabel.x, y, fonts, { size: P.metaLabel.size, bold: true });
        txt(page, value, P.metaValue.x, y, fonts, { size: P.metaValue.size });
        row++;
      }

      const introLines = [
        'Wir bestellen gemäß unseren allgemeinen Geschäftsbedingungen wie folgt:',
        'siehe www.mtcon.eu/power2pcb/aeb/',
      ];
      introLines.forEach((l, li) => {
        txt(page, l, P.intro.x, P.intro.top + li * P.intro.lineHeight, fonts, { size: P.intro.size });
      });
    }

    txt(page, 'Pos',           P.cols.pos,     P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Artikel-Nr',    P.cols.article, P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Liefertermin',  P.cols.termin,  P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Menge',         P.cols.menge,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
    txt(page, 'Preis',         P.cols.preis,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
    txt(page, 'Positionswert', P.cols.value,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });

    let cursor = P.tableTop;
    for (const b of pagesOfBlocks[i]) {
      txt(page, b.header.pos,    P.cols.pos,     cursor, fonts, { size: 9, bold: true });
      if (b.header.artNr)  txt(page, b.header.artNr,  P.cols.article, cursor, fonts, { size: 9, bold: true });
      if (b.header.termin) txt(page, b.header.termin, P.cols.termin,  cursor, fonts, { size: 9 });
      if (b.header.qty)    txt(page, b.header.qty,    P.cols.menge,   cursor, fonts, { size: 9, align: 'right' });
      if (b.header.price)  txt(page, b.header.price,  P.cols.preis,   cursor, fonts, { size: 9, align: 'right' });
      if (b.header.value)  txt(page, b.header.value,  P.cols.value,   cursor, fonts, { size: 9, align: 'right' });
      cursor += P.rowLine;
      for (const l of b.descriptionLines) { txt(page, l, P.cols.article, cursor, fonts, { size: 9 }); cursor += P.rowLine; }
      for (const l of b.extraLines)       { txt(page, l, P.cols.article, cursor, fonts, { size: 9 }); cursor += P.rowLine; }
      cursor += 6;
    }

    if (isLast) {
      let condY = Math.max(cursor + 18, 700);
      const drawCond = (label: string, value: string) => {
        const lines = value.split('\n');
        txt(page, label, P.condLabel.x, condY, fonts, { size: P.condLabel.size, bold: true });
        lines.forEach((l, li) => {
          txt(page, l, P.condValue.x, condY + li * P.condLabel.lineHeight, fonts, { size: P.condValue.size });
        });
        condY += P.condLabel.lineHeight * lines.length;
      };
      if (d.expected) drawCond('Wunschtermin', fmt.date(d.expected));
      if (d.notes)    drawCond('Anmerkungen', d.notes);
      if (d.isFrame) {
        txt(page, 'R=Rahmen  A=Abruf  F=Feinabruf  V=Vorschau  M=Materialfreigabe',
          P.condLabel.x, condY + 6, fonts, { size: 8 });
        condY += 20;
      }
      const closingY = Math.max(condY + 12, P.closing.top - 20);
      txt(page, 'Mit freundlichen Grüßen', P.closing.x, closingY, fonts, { size: P.closing.size });
      txt(page, 'MTCONNECTIVITY power2pcb GmbH', P.closing.x, closingY + P.closing.lineHeight, fonts, { size: P.closing.size });
    }

    if (opts.demo) {
      page.drawText('DEMO', { x: 90, y: 240, size: 180, font: bold, color: COLOR_RED, opacity: 0.18, rotate: degrees(35) });
      page.drawText('DEMO — nicht rechtsgültig', { x: 48, y: topY(60), size: 8, font: bold, color: COLOR_RED, opacity: 0.9 });
    }
  }

  return await pdf.save();
}

export async function openPurchaseOverlayPdf(data: BestellungData, opts: { demo?: boolean } = {}): Promise<void> {
  const bytes = await renderPurchaseOverlay(data, opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${opts.demo ? 'DEMO-' : ''}Bestellung-${data.poNo || 'preview'}.pdf`;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
