// Angebots-PDF via Overlay auf pixelgleiche Original-Vorlage.
// Nutzt pdf-lib: (1) weiße Masken über alle statisch bedruckten Textzonen der
// Vorlage (Kopfdaten, Positionen, Fußdaten), (2) Inhalt wird neu gezeichnet.
// Die Originaldatei enthält eine erste Seite und passende Folgeseiten.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateUrl from '@/assets/offer-template.pdf?url';
import { loadTemplateBytes as loadErpTemplateBytes, type TemplateScope } from './templateSource';
import { fmt } from './renderer';
import { drawStatusStamp, type DocStatusInfo } from './statusStamp';
import type { AngebotData } from './generators';

const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);
const SHADE = rgb(0.86, 0.86, 0.86);

// Seite 1: alle bedruckten dynamischen Zonen der Vorlage überdecken
const MASKS_P1: [number, number, number, number][] = [
  [335, 155, 570, 175],   // Titel "Angebot Nr. …"
  [ 45, 175, 330, 255],   // Empfänger-Block
  [335, 175, 570, 285],   // Meta-Labels + Werte
  [335, 285, 570, 310],   // Datum + Seitenzähler
  [ 45, 315, 570, 410],   // Intro
  [ 45, 420, 570, 445],   // Tabellen-Header
  [ 45, 445, 570, 755],   // Positionen
];
// Folge-Seiten: Empfängerblock & Meta gehören dort nicht mehr hin → auch maskieren
const MASKS_PX: [number, number, number, number][] = [
  [335, 155, 570, 175],
  [335, 175, 570, 230],
  [ 45, 240, 570, 285],
  [ 45, 285, 570, 310],
  [ 45, 310, 570, 755],
];

const P = {
  title:      { x: 335, top: 160, size: 10 },
  recipient:  { x: 70,  top: 180, size: 9, lineHeight: 12 },
  metaLabel:  { x: 335, top: 180, size: 8, lineHeight: 12 },
  metaValue:  { x: 435, top: 180, size: 8, lineHeight: 12 },
  dateLabel:  { x: 335, top: 297, size: 8 },
  dateValue:  { x: 435, top: 297, size: 8 },
  pageValue:  { x: 500, top: 297, size: 8 },
  intro:      { x: 70,  top: 335, size: 9, lineHeight: 14 },
  headerRow:  { top: 426, size: 8 },
  tableTop:   458,
  tableBottom: 720,
  rowLine:    11,
  cols: {
    pos:     66,
    article: 100,
    menge:   360,  // right
    preis:   455,  // right
    value:   560,  // right
  },
  condLabel: { x: 70,  size: 8, lineHeight: 12 },
  condValue: { x: 165, size: 8, lineHeight: 12 },
  totalLabel:{ x: 420, size: 10 },
  totalValue:{ x: 560, size: 10 },
  closing:   { x: 70, top: 720, size: 8, lineHeight: 12 },
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplateBytes(scope?: TemplateScope): Promise<ArrayBuffer> {
  return loadErpTemplateBytes('angebot', templateUrl, scope);
}

function mask(page: PDFPage, boxes: [number, number, number, number][]) {
  for (const [x1, y1, x2, y2] of boxes) {
    page.drawRectangle({
      x: x1, y: topY(y2),
      width: x2 - x1, height: y2 - y1,
      color: WHITE,
    });
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
  page.drawText(text, {
    x: drawX, y: topY(yTop + size * 0.85),
    size, font, color,
  });
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

// Blockstruktur einer Position: alle Zeilen, die zusammen bleiben müssen
interface PosBlock {
  header: { pos: string; artNr: string; qty: string; price: string; value: string };
  descriptionLines: string[];
  extraLines: string[];
  height: number;
}

export async function renderOfferOverlay(
  d: AngebotData,
  opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {},
): Promise<Uint8Array> {
  const tplBytes = await loadTemplateBytes(opts.scope);
  const tplDoc = await PDFDocument.load(tplBytes);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  // Positionen in Blöcke aufteilen
  const beschWidth = P.cols.value - 20 - P.cols.article;
  const blocks: PosBlock[] = d.items.map((it, idx) => {
    const posNo = it.pos != null && it.pos !== '' ? String(it.pos) : String((idx + 1) * 10);
    const qtyStr = it.quantity != null ? `${fmt.qty(it.quantity)} ${it.unit || 'ST'}` : '';
    const priceStr = it.price != null
      ? `${fmt.currency(it.price, d.currency)}${it.unit && it.unit !== 'ST' ? ` / ${it.unit}` : ''}`
      : '';
    const valueStr = it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '';
    const descLines: string[] = [];
    if (it.description) for (const l of it.description.split('\n')) descLines.push(...wrap(l, regular, 9, beschWidth));
    const extraLines: string[] = [];
    for (const ex of it.extraLines || []) for (const l of String(ex).split('\n')) extraLines.push(...wrap(l, regular, 9, beschWidth));
    const height = (1 + descLines.length + extraLines.length) * P.rowLine + 6;
    return {
      header: { pos: posNo, artNr: it.artNr || '', qty: qtyStr, price: priceStr, value: valueStr },
      descriptionLines: descLines,
      extraLines,
      height,
    };
  });

  // Verteilen auf Seiten
  const usable = P.tableBottom - P.tableTop;
  const pagesOfBlocks: PosBlock[][] = [];
  let current: PosBlock[] = [];
  let used = 0;
  for (const b of blocks) {
    if (used + b.height > usable && current.length) {
      pagesOfBlocks.push(current);
      current = [];
      used = 0;
    }
    current.push(b);
    used += b.height;
  }
  if (current.length) pagesOfBlocks.push(current);
  if (pagesOfBlocks.length === 0) pagesOfBlocks.push([]);

  const totalPages = pagesOfBlocks.length;

  const drawnPages: PDFPage[] = [];
  for (let i = 0; i < totalPages; i++) {
    const templatePageIndex = i === 0 ? 0 : Math.min(i, tplDoc.getPageCount() - 1);
    const [copied] = await pdf.copyPages(tplDoc, [templatePageIndex]);
    pdf.addPage(copied);
    drawnPages.push(copied);
  }

  for (let i = 0; i < totalPages; i++) {
    const page = drawnPages[i];
    const isFirst = i === 0;
    mask(page, isFirst ? MASKS_P1 : MASKS_PX);

    // Titel
    page.drawRectangle({ x: 335, y: topY(175), width: 225, height: 20, color: SHADE });
    txt(page, `Angebot Nr. ${d.offerNo}`, P.title.x, P.title.top, fonts,
      { size: P.title.size, bold: true });

    // Datum + Seite
    txt(page, 'Datum', P.dateLabel.x, P.dateLabel.top, fonts, { size: P.dateLabel.size, bold: true });
    txt(page, d.date, P.dateValue.x, P.dateValue.top, fonts, { size: P.dateValue.size, bold: true });
    txt(page, `${i + 1} von ${totalPages}`, P.pageValue.x, P.pageValue.top, fonts, { size: P.pageValue.size });

    if (isFirst) {
      // Empfänger
      const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
      recipientLines.forEach((line, li) => {
        txt(page, line, P.recipient.x, P.recipient.top + li * P.recipient.lineHeight, fonts,
          { size: P.recipient.size });
      });

      // Meta
      const metaRows: Array<[string, string | undefined | null]> = [
        ['Kunden-Nr',       d.contact.customerNo ? String(d.contact.customerNo) : undefined],
        ['Ansprechpartner', d.contact.contactName],
        ['Telefon',         d.contact.phone],
        ['Fax',             d.contact.fax],
        ['E-Mail',          d.contact.email],
        ['Betreff',         d.contact.subject],
      ];
      let row = 0;
      for (const [label, value] of metaRows) {
        if (!value) continue;
        const y = P.metaLabel.top + row * P.metaLabel.lineHeight;
        txt(page, label, P.metaLabel.x, y, fonts, { size: P.metaLabel.size, bold: true });
        const valueLines = wrap(String(value), regular, P.metaValue.size, 120);
        valueLines.forEach((line, lineIndex) => {
          txt(page, line, P.metaValue.x, y + lineIndex * P.metaLabel.lineHeight, fonts, { size: P.metaValue.size });
        });
        row += Math.max(1, valueLines.length);
      }

      // Intro
      const introLines = [
        'Sehr geehrte Damen und Herren,',
        '',
        'Vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen gemäß unseren allgemeinen',
        'Verkaufsbedingungen wie folgt an:',
        'siehe www.mtcon.eu/power2pcb/avb/',
      ];
      introLines.forEach((l, li) => {
        txt(page, l, P.intro.x, P.intro.top + li * P.intro.lineHeight, fonts, { size: P.intro.size });
      });
    }

    // Tabellen-Header
    page.drawRectangle({ x: 45, y: topY(438), width: 525, height: 18, color: SHADE });
    txt(page, 'Pos',           P.cols.pos,     P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Art.-Nr.',      P.cols.article, P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Menge',         P.cols.menge,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
    txt(page, 'Preis',         P.cols.preis,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
    txt(page, 'Positionswert', P.cols.value,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });

    // Positionen
    let cursor = P.tableTop;
    for (const b of pagesOfBlocks[i]) {
      txt(page, b.header.pos,   P.cols.pos,     cursor, fonts, { size: 9, bold: true });
      if (b.header.artNr) txt(page, b.header.artNr, P.cols.article, cursor, fonts, { size: 9, bold: true });
      if (b.header.qty)   txt(page, b.header.qty,   P.cols.menge,   cursor, fonts, { size: 9, align: 'right' });
      if (b.header.price) txt(page, b.header.price, P.cols.preis,   cursor, fonts, { size: 9, align: 'right' });
      if (b.header.value) txt(page, b.header.value, P.cols.value,   cursor, fonts, { size: 9, align: 'right' });
      cursor += P.rowLine;
      for (const l of b.descriptionLines) {
        txt(page, l, P.cols.article, cursor, fonts, { size: 9 });
        cursor += P.rowLine;
      }
      for (const l of b.extraLines) {
        txt(page, l, P.cols.article, cursor, fonts, { size: 9 });
        cursor += P.rowLine;
      }
      cursor += 6;
    }

    // Konditionen + Summe + Closing nur auf letzter Seite
    if (i === totalPages - 1) {
      let condY = Math.max(cursor + 18, 650);
      const drawCond = (label: string, value: string) => {
        txt(page, label, P.condLabel.x, condY, fonts, { size: P.condLabel.size, bold: true });
        txt(page, value, P.condValue.x, condY, fonts, { size: P.condValue.size });
        condY += P.condLabel.lineHeight;
      };
      if (d.deliveryTerms) drawCond('Lieferung', d.deliveryTerms);
      if (d.paymentTerms)  drawCond('Zahlungsbedingungen', d.paymentTerms);
      if (d.validUntil)    drawCond('Gültigkeit bis', fmt.date(d.validUntil));
      if (d.notes)         drawCond('Anmerkungen', d.notes);

      // Closing
      const closingY = Math.max(condY + 12, P.closing.top);
      txt(page, 'Wir würden uns freuen, wenn Ihnen unser Angebot zusagt.', P.closing.x, closingY, fonts, { size: P.closing.size });
      txt(page, 'Mit freundlichen Grüßen', P.closing.x, closingY + P.closing.lineHeight, fonts, { size: P.closing.size });
      txt(page, 'MTCONNECTIVITY power2pcb GmbH', P.closing.x, closingY + P.closing.lineHeight * 2, fonts, { size: P.closing.size });
    }

    // Demo-Wasserzeichen
    if (opts.demo) {
      page.drawText('DEMO', {
        x: 90, y: 240, size: 180, font: bold, color: COLOR_RED,
        opacity: 0.18, rotate: degrees(35),
      });
      page.drawText('DEMO — nicht rechtsgültig', {
        x: 48, y: topY(60), size: 8, font: bold, color: COLOR_RED, opacity: 0.9,
      });
    }
  }

  drawStatusStamp(pdf, regular, opts.statusInfo);

  return await pdf.save();
}

/** Öffnet das Overlay-Angebot in einem neuen Tab (Anchor-Klick, popup-safe). */
export async function openOfferOverlayPdf(
  data: AngebotData,
  opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {},
): Promise<void> {
  const bytes = await renderOfferOverlay(data, opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${opts.demo ? 'DEMO-' : ''}Angebot-${data.offerNo || 'preview'}.pdf`;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
