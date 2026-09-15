// Lieferschein-PDF via Overlay auf pixelgleiche Original-Vorlage (identisches
// Design zur Rechnung: Logo, Briefkopf, Footer bleiben aus der Vorlage
// unverändert). Nur der dynamische Inhalt (Titel, Meta, Positionen, Bottom)
// wird maskiert und neu gezeichnet. Unterstützt mehrere Seiten mit
// wiederholtem Lieferschein-Nr.-Kopf ab Seite 2 (BUG-2026-0139).
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateUrl from '@/assets/delivery-template.pdf?url';
import { loadTemplateBytes as loadErpTemplateBytes, type TemplateScope } from './templateSource';
import { fmt } from './renderer';
import type { LieferscheinData } from './generators';

const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);

// Seite 1: alle statisch bedruckten Text-Zonen der Vorlage
const MASKS_P1: [number, number, number, number][] = [
  [340, 128, 570, 158], // Titel "Lieferschein Nr. …"
  [ 45, 155, 335, 220], // Empfänger
  [340, 155, 570, 225], // Meta-Labels + Werte
  [340, 225, 570, 252], // Datum + Seitenzähler
  [ 45, 253, 570, 300], // Intro-Zeile(n)
  [ 45, 300, 570, 322], // Tabellen-Header
  [ 45, 322, 570, 710], // Positionen + Bottom-Bereich (Lieferung, Packstücke)
  [ 45, 720, 570, 760], // Closing
];
// Folgeseiten: Empfänger + Meta gehören dort nicht mehr hin → auch maskieren,
// aber Titel-Zone offen halten, damit "Lieferschein Nr. …" neu gedruckt wird.
const MASKS_PX: [number, number, number, number][] = [
  [340, 128, 570, 158],
  [ 45, 155, 570, 252],
  [ 45, 253, 570, 300],
  [ 45, 300, 570, 322],
  [ 45, 322, 570, 710],
  [ 45, 720, 570, 760],
];

const P = {
  title:        { x: 358, top: 134, size: 11 },
  recipient:    { x: 71,  top: 158, size: 10, lineHeight: 13 },
  metaLabel:    { x: 358, top: 160, size: 9,  lineHeight: 12 },
  metaValue:    { x: 456, top: 160, size: 9,  lineHeight: 12 },
  dateLabel:    { x: 358, top: 233, size: 9 },
  dateValue:    { x: 456, top: 233, size: 9 },
  pageValue:    { x: 505, top: 233, size: 9 },
  intro:        { x: 66,  top: 262, size: 9, lineHeight: 12 },
  headerRow:    { top: 305, size: 9 },
  tableTop:     324,
  tableBottom:  620,
  rowLine:      11,
  cols: {
    auftr:   66,   // Auftr-Nr
    pos:     130,  // Pos
    article: 165,  // Artikel-Nr
    besch:   260,  // Bestelldaten
    menge:   560,  // Menge, right-align
  },
  bottomLabel:  { x: 66,  size: 9, lineHeight: 14 },
  bottomValue:  { x: 208, size: 9, lineHeight: 14 },
  closing:     { x: 66,  top: 740, size: 9, lineHeight: 12 },
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplate(scope?: TemplateScope): Promise<ArrayBuffer> {
  return loadErpTemplateBytes('lieferschein', templateUrl, scope);
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

// Ein Positionsblock, der zusammen bleiben muss (Kopfzeile + Beschreibung).
interface PosBlock {
  auftr: string;
  pos: string;
  artNr: string;
  qty: string;
  descLines: string[];
  height: number;
}

export async function renderDeliveryOverlay(
  d: LieferscheinData,
  opts: { demo?: boolean; scope?: TemplateScope } = {},
): Promise<Uint8Array> {
  const tplBytes = await loadTemplate(opts.scope);
  const tplDoc = await PDFDocument.load(tplBytes);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const title = d.isReturn ? 'Rücklieferschein Nr.' : 'Lieferschein Nr.';
  const beschWidth = P.cols.menge - 20 - P.cols.besch;

  // Positionen in Blöcke aufteilen
  const blocks: PosBlock[] = d.items.map((it) => {
    const descLines: string[] = [];
    if (it.description) {
      for (const l of it.description.split('\n')) descLines.push(...wrap(l, regular, 9, beschWidth));
    }
    for (const ex of it.extraLines || []) {
      for (const l of String(ex).split('\n')) descLines.push(...wrap(l, regular, 9, beschWidth));
    }
    const lineCount = Math.max(1, descLines.length);
    return {
      auftr: String(it.orderNo || d.orderNo || ''),
      pos: it.pos != null && it.pos !== '' ? String(it.pos) : '',
      artNr: it.artNr || '',
      qty: it.quantity != null ? `${fmt.qty(it.quantity)} ${it.unit || 'ST'}` : '',
      descLines,
      height: lineCount * P.rowLine + 4,
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

  // Seiten aus Vorlage kopieren
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

    // Titel (auf jeder Seite — auch Folgeseiten)
    txt(page, `${title} ${d.deliveryNo}`, P.title.x, P.title.top, fonts,
      { size: P.title.size, bold: true });

    // Datum + Seite (auf jeder Seite)
    txt(page, 'Datum', P.dateLabel.x, P.dateLabel.top, fonts,
      { size: P.dateLabel.size, bold: true });
    txt(page, d.date, P.dateValue.x, P.dateValue.top, fonts,
      { size: P.dateValue.size, bold: true });
    txt(page, `${i + 1} von ${totalPages}`, P.pageValue.x, P.pageValue.top, fonts,
      { size: P.pageValue.size });

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
      ];
      let row = 0;
      for (const [label, value] of metaRows) {
        if (!value) continue;
        const y = P.metaLabel.top + row * P.metaLabel.lineHeight;
        txt(page, label, P.metaLabel.x, y, fonts, { size: P.metaLabel.size, bold: true });
        txt(page, value, P.metaValue.x, y, fonts, { size: P.metaValue.size });
        row++;
      }

      // Intro (2 Zeilen)
      const introLines = d.isReturn
        ? ['Wir senden Ihnen folgende Positionen zurück gemäß unseren allgemeinen Geschäftsbedingungen:',
           'siehe www.mtcon.eu/power2pcb/avb/']
        : ['Wir liefern Ihnen folgende Positionen gemäß unseren allgemeinen Geschäftsbedingungen:',
           'siehe www.mtcon.eu/power2pcb/avb/'];
      introLines.forEach((l, li) => {
        txt(page, l, P.intro.x, P.intro.top + li * P.intro.lineHeight, fonts, { size: P.intro.size });
      });
    }

    // Tabellen-Header (auf jeder Seite)
    txt(page, 'Auftr-Nr',    P.cols.auftr,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Pos',         P.cols.pos,     P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Artikel-Nr',  P.cols.article, P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Bestelldaten', P.cols.besch,  P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
    txt(page, 'Menge',       P.cols.menge,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });

    // Positionen für diese Seite
    let cursor = P.tableTop;
    for (const b of pagesOfBlocks[i]) {
      if (b.auftr) txt(page, b.auftr, P.cols.auftr, cursor, fonts, { size: 9 });
      if (b.pos)   txt(page, b.pos,   P.cols.pos,   cursor, fonts, { size: 9 });
      if (b.artNr) txt(page, b.artNr, P.cols.article, cursor, fonts, { size: 9 });
      b.descLines.forEach((l, li) => {
        txt(page, l, P.cols.besch, cursor + li * P.rowLine, fonts, { size: 9 });
      });
      if (b.qty) txt(page, b.qty, P.cols.menge, cursor, fonts, { size: 9, align: 'right' });
      cursor += Math.max(1, b.descLines.length) * P.rowLine + 4;
    }

    if (isLast) {
      // Bottom-Bereich: Lieferung, Packstücke, Notizen
      let bottomY = Math.max(cursor + 14, P.tableBottom + 10);
      const drawBottom = (label: string, value: string) => {
        txt(page, label, P.bottomLabel.x, bottomY, fonts, { size: P.bottomLabel.size, bold: true });
        txt(page, value, P.bottomValue.x, bottomY, fonts, { size: P.bottomValue.size });
        bottomY += P.bottomLabel.lineHeight;
      };
      if (d.deliveryTerms) drawBottom('Lieferung', d.deliveryTerms);
      if (d.packages != null) drawBottom('Anzahl Packstücke', String(d.packages));
      if (d.notes) drawBottom('Anmerkungen', d.notes);

      // Closing
      const closingY = Math.max(bottomY + 20, P.closing.top);
      txt(page, 'Mit freundlichen Grüßen', P.closing.x, closingY, fonts, { size: P.closing.size });
      txt(page, 'MTCONNECTIVITY power2pcb GmbH', P.closing.x, closingY + P.closing.lineHeight, fonts, { size: P.closing.size });
    }

    // DEMO-Wasserzeichen
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

  return await pdf.save();
}

/** Öffnet den Overlay-Lieferschein in einem neuen Tab (Anchor-Klick, popup-safe). */
export async function openDeliveryOverlayPdf(
  data: LieferscheinData,
  opts: { demo?: boolean; scope?: TemplateScope } = {},
): Promise<void> {
  const bytes = await renderDeliveryOverlay(data, opts);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${opts.demo ? 'DEMO-' : ''}${data.isReturn ? 'Ruecklieferschein' : 'Lieferschein'}-${data.deliveryNo || 'preview'}.pdf`;
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
