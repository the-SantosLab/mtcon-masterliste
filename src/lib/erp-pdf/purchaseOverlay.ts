// Bestellung (PO an Lieferant) via Overlay auf pixelgleiche Original-Vorlage.
// Layout exakt wie Angebot / Auftragsbestätigung / Rechnung: gleiche Titelleiste,
// gleiche Meta-Spalte, identische Tabellengeometrie, Totals-Block und Fußtext.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateUrl from '@/assets/purchase-template.pdf?url';
import { loadTemplateBytes as loadErpTemplateBytes, type TemplateScope } from './templateSource';
import { fmt } from './renderer';
import { drawStatusStamp, type DocStatusInfo } from './statusStamp';
import type { BestellungData } from './generators';

const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);
const SHADE = rgb(0.86, 0.86, 0.86);

const MASKS_P1: [number, number, number, number][] = [
  [330, 140, 575, 315],
  [ 45, 145, 330, 300],
  [ 45, 305, 575, 755],
];
const MASKS_PX: [number, number, number, number][] = [
  [330, 140, 575, 210],
  [ 45, 210, 575, 755],
];

const P = {
  title:      { x: 335, top: 150, size: 10 },
  recipient:  { x: 70,  top: 170, size: 9, lineHeight: 12 },
  metaLabel:  { x: 335, top: 170, size: 8,  lineHeight: 11 },
  metaValue:  { x: 435, top: 170, size: 8,  lineHeight: 11 },
  dateLabel:  { x: 335, top: 294, size: 8 },
  dateValue:  { x: 435, top: 294, size: 8 },
  pageValue:  { x: 500, top: 294, size: 8 },

  intro:      { x: 70,  top: 323, size: 9, lineHeight: 13 },
  headerRow:  { top: 369, size: 8 },
  tableTop:   400,
  tableBottom: 715,
  rowLine:    11,
  cols: {
    pos:     66,
    article: 100,
    termin:  225,
    menge:   360,
    preis:   455,
    value:   560,
  },
  totalLabel:{ x: 365, lineHeight: 13, size: 9 },
  totalValue:{ x: 560, lineHeight: 13, size: 9 },
  condLabel: { x: 70,  size: 9, lineHeight: 14 },
  condValue: { x: 180, size: 9, lineHeight: 14 },
  closing:   { x: 70, top: 520, size: 9, lineHeight: 12 },
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplate(scope?: TemplateScope): Promise<ArrayBuffer> {
  return loadErpTemplateBytes('bestellung', templateUrl, scope);
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
  opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {},
): Promise<Uint8Array> {
  const tplBytes = await loadTemplate(opts.scope);
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
      ? `${fmt.currency(it.price, d.currency)} / ${it.unit || '1000'}` : '';
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

  // Summen analog Auftragsbestätigung / Rechnung.
  const subtotal = d.items.reduce((s, it) => s + (it.positionValue ?? 0), 0);
  const taxRate = 19;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const usable = P.tableBottom - P.tableTop;
  const pagesOfBlocks: PosBlock[][] = [];
  let current: PosBlock[] = []; let used = 0;
  for (const b of blocks) {
    if (used + b.height > usable && current.length) { pagesOfBlocks.push(current); current = []; used = 0; }
    current.push(b); used += b.height;
  }
  if (current.length) pagesOfBlocks.push(current);
  if (pagesOfBlocks.length === 0) pagesOfBlocks.push([]);
  const totalPages = pagesOfBlocks.length + 1;

  const drawnPages: PDFPage[] = [];
  for (let i = 0; i < totalPages; i++) {
    const templatePageIndex = i === 0 ? 0 : Math.min(1, tplDoc.getPageCount() - 1);
    const [copied] = await pdf.copyPages(tplDoc, [templatePageIndex]);
    pdf.addPage(copied);
    drawnPages.push(copied);
  }

  for (let i = 0; i < totalPages; i++) {
    const page = drawnPages[i];
    const isFirst = i === 0;
    const isLast = i === totalPages - 1;
    mask(page, isFirst ? MASKS_P1 : MASKS_PX);

    page.drawRectangle({ x: 335, y: topY(165), width: 225, height: 20, color: SHADE });
    txt(page, `Bestellung Nr. ${d.poNo}`, P.title.x, P.title.top, fonts,
      { size: P.title.size, bold: true });

    if (isFirst) {
      const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
      recipientLines.forEach((line, li) => {
        txt(page, line, P.recipient.x, P.recipient.top + li * P.recipient.lineHeight, fonts,
          { size: P.recipient.size });
      });

      const metaRows: Array<[string, string | undefined | null]> = [
        ['Lieferanten-Nr',  d.contact.supplierNo || (d.contact.customerNo ? String(d.contact.customerNo) : undefined)],
        ['Ansprechpartner', d.contact.contactName],
        ['Telefon',         d.contact.phone],
        ['Fax',             d.contact.fax],
        ['E-Mail',          d.contact.email],
        ['USt-ID-Nr',       d.contact.vatId],
        ['Betreff',         d.contact.subject],
      ];
      let row = 0;
      for (const [label, value] of metaRows) {
        if (!value) continue;
        const y = P.metaLabel.top + row * P.metaLabel.lineHeight;
        txt(page, label, P.metaLabel.x, y, fonts, { size: P.metaLabel.size, bold: true });
        const valueLines = wrap(String(value), regular, P.metaValue.size, 120);
        valueLines.forEach((line, lineIndex) => txt(page, line, P.metaValue.x, y + lineIndex * P.metaLabel.lineHeight, fonts, { size: P.metaValue.size }));
        row += Math.max(1, valueLines.length);
      }

      const introLines = [
        'Wir bestellen gemäß unseren allgemeinen Einkaufsbedingungen wie folgt:',
        'siehe www.mtcon.eu/power2pcb/aeb/',
      ];
      introLines.forEach((l, li) => {
        txt(page, l, P.intro.x, P.intro.top + li * P.intro.lineHeight, fonts, { size: P.intro.size });
      });
    }

    const dateTop = isFirst ? P.dateLabel.top : 179;
    txt(page, 'Datum', P.dateLabel.x, dateTop, fonts, { size: P.dateLabel.size, bold: true });
    txt(page, d.date, P.dateValue.x, dateTop, fonts, { size: P.dateValue.size });
    txt(page, `Seite ${i + 1} von ${totalPages}`, P.pageValue.x, dateTop, fonts, { size: P.pageValue.size });

    if (i < pagesOfBlocks.length) {
      page.drawRectangle({ x: 45, y: topY(384), width: 525, height: 18, color: SHADE });
      txt(page, 'Pos',           P.cols.pos,     P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, 'Art.-Nr.',      P.cols.article, P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, 'Termin',        P.cols.termin,  P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, 'Menge',         P.cols.menge,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
      txt(page, 'Preis',         P.cols.preis,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
      txt(page, 'Positionswert', P.cols.value,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });

      let cursor = P.tableTop;
      for (const b of pagesOfBlocks[i] || []) {
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
    }

    if (isLast) {
      // Totals-Block
      page.drawLine({ start: { x: 70, y: topY(222) }, end: { x: 560, y: topY(222) }, thickness: 0.6, color: COLOR_TEXT });
      let totalsY = 238;
      const totals: Array<[string, string, boolean]> = [
        ['Nettobetrag', fmt.currency(subtotal, d.currency), false],
        [`MwSt ${taxRate.toFixed(2).replace('.', ',')}%`, fmt.currency(tax, d.currency), false],
        ['Gesamtbetrag', fmt.currency(total, d.currency), true],
      ];
      for (const [label, value, boldRow] of totals) {
        txt(page, label, P.totalLabel.x, totalsY, fonts, { size: P.totalLabel.size, bold: true });
        txt(page, value, P.totalValue.x, totalsY, fonts, { size: P.totalValue.size, bold: boldRow, align: 'right' });
        totalsY += P.totalLabel.lineHeight;
      }

      // Konditionen
      let condY = 315;
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

      let noteY = condY + 18;
      if (d.isFrame) {
        txt(page, 'R=Rahmen  A=Abruf  F=Feinabruf  V=Vorschau  M=Materialfreigabe',
          P.condLabel.x, noteY, fonts, { size: 8 });
        noteY += 14;
      }
      const notices = [
        'Bitte bestätigen Sie uns diese Bestellung mit verbindlichem Liefertermin.',
        '',
        'Es gelten ausschließlich unsere Einkaufsbedingungen. Abweichende Bedingungen des Lieferanten',
        'werden nur wirksam, wenn wir ihnen schriftlich zugestimmt haben.',
        '',
        'Bitte geben Sie auf allen Lieferpapieren und Rechnungen unsere Bestellnummer an.',
      ];
      notices.forEach((line, lineIndex) => txt(page, line, P.condLabel.x, noteY + lineIndex * 12, fonts, { size: 8 }));
      const closingY = Math.max(noteY + notices.length * 12 + 8, P.closing.top);
      txt(page, 'Mit freundlichen Grüßen', P.closing.x, closingY, fonts, { size: P.closing.size });
      txt(page, 'MTCONNECTIVITY power2pcb GmbH', P.closing.x, closingY + P.closing.lineHeight, fonts, { size: P.closing.size });
    }

    if (opts.demo) {
      page.drawText('DEMO', { x: 90, y: 240, size: 180, font: bold, color: COLOR_RED, opacity: 0.18, rotate: degrees(35) });
      page.drawText('DEMO — nicht rechtsgültig', { x: 48, y: topY(60), size: 8, font: bold, color: COLOR_RED, opacity: 0.9 });
    }
  }

  drawStatusStamp(pdf, regular, opts.statusInfo);

  return await pdf.save();
}

export async function openPurchaseOverlayPdf(data: BestellungData, opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {}): Promise<void> {
  const bytes = await renderPurchaseOverlay(data, opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${opts.demo ? 'DEMO-' : ''}Bestellung-${data.poNo || 'preview'}.pdf`;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
