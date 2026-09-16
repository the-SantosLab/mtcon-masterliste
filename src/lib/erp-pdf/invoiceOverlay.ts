// Rechnungs-PDF via Overlay auf pixelgleiche Original-Vorlage.
// Design identisch zu Angebot / Auftragsbestätigung / Bestellung.
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, degrees } from 'pdf-lib';
import templateUrl from '@/assets/invoice-template.pdf?url';
import { loadTemplateBytes as loadErpTemplateBytes, type TemplateScope } from './templateSource';
import { fmt } from './renderer';
import { drawStatusStamp, type DocStatusInfo } from './statusStamp';
import type { RechnungData } from './generators';

const PAGE_H = 842;
const topY = (yFromTop: number) => PAGE_H - yFromTop;

const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_RED = rgb(0.86, 0.08, 0.24);
const WHITE = rgb(1, 1, 1);
const SHADE = rgb(0.86, 0.86, 0.86);

const MASKS_P1: [number, number, number, number][] = [
  [330, 140, 575, 315],
  [ 45, 145, 330, 300],
  [ 45, 288, 575, 755],
];
const MASKS_PX: [number, number, number, number][] = [
  [330, 140, 575, 210],
  [ 45, 195, 575, 755],
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
    dn:      225,
    menge:   360,
    preis:   455,
    value:   560,
  },
  totalLabel: { x: 365, lineHeight: 13, size: 9 },
  totalValue: { x: 560, lineHeight: 13, size: 9 },
  condLabel:  { x: 70,  size: 9, lineHeight: 14 },
  condValue:  { x: 180, size: 9, lineHeight: 14 },
  factoring:  { x: 70,  size: 8, lineHeight: 11, width: 490 },
};

// ---- Beschriftungen DE/EN ----
type Lang = 'de' | 'en';
const L = {
  invoiceNo:     { de: 'Rechnung Nr.',     en: 'Invoice No.' },
  creditNoteNo:  { de: 'Gutschrift Nr.',   en: 'Credit note No.' },
  stornoNo:      { de: 'Storno Nr.',       en: 'Cancellation No.' },
  custNo:        { de: 'Kunden-Nr',        en: 'Cust.no' },
  contact:       { de: 'Ansprechpartner',  en: 'Contact person' },
  phone:         { de: 'Telefon',          en: 'Phone' },
  fax:           { de: 'Fax',              en: 'Fax' },
  email:         { de: 'E-Mail',           en: 'Email' },
  vatId:         { de: 'USt-ID-Nr',        en: 'VAT ID' },
  subject:       { de: 'Betreff',          en: 'Subject' },
  date:          { de: 'Datum',            en: 'Date' },
  page:          { de: 'Seite',            en: 'Page' },
  of:            { de: 'von',              en: 'of' },
  from:          { de: 'vom',              en: 'from' },
  intro:         { de: 'wir berechnen Ihnen folgende Positionen:',
                   en: 'we will charge you the following positions:' },
  introCredit:   { de: 'wir schreiben Ihnen folgende Positionen gut:',
                   en: 'we credit you for the following positions:' },
  colPos:        { de: 'Pos',              en: 'Pos' },
  colDn:         { de: 'LS-Nr.',           en: 'DN no' },
  colArticle:    { de: 'Art.-Nr.',         en: 'Article No' },
  colQty:        { de: 'Menge',            en: 'Qty' },
  colPrice:      { de: 'Preis',            en: 'Price' },
  colValue:      { de: 'Positionswert',    en: 'Item value' },
  net:           { de: 'Nettobetrag',      en: 'Net amount' },
  total:         { de: 'Gesamtbetrag',     en: 'Total amount' },
  payment:       { de: 'Zahlungsbedingung', en: 'Payment term' },
  dueDate:       { de: 'Fällig am',        en: 'Due date' },
  currencyUsd:   { de: 'Währung in USD / US$', en: 'Currency in USD / US$' },
  unitPcs:       { de: 'Stk',              en: 'Pcs' },
  taxReverse:    { de: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG / Reverse charge).',
                   en: 'Reverse charge — VAT liability transferred to the recipient.' },
  taxFreeEu:     { de: 'Innergemeinschaftliche Lieferung, steuerfrei nach § 4 Nr. 1b UStG.',
                   en: 'Intra-community supply, VAT-exempt.' },
  taxFreeThird:  { de: 'Ausfuhrlieferung, steuerfrei nach § 4 Nr. 1a UStG.',
                   en: 'Export delivery, VAT-exempt.' },
  taxSmall:      { de: 'Kein Steuerausweis gem. § 19 UStG (Kleinunternehmer).',
                   en: 'No VAT charged under § 19 UStG (small business exemption).' },
  skonto:        { de: (p: string, d: string) => `Skonto: ${p}% bei Zahlung innerhalb ${d} Tagen.`,
                   en: (p: string, d: string) => `Cash discount: ${p}% if paid within ${d} days.` },
};
const t = (key: keyof typeof L, lang: Lang) => L[key][lang] as string;

const FACTORING = {
  de: [
    'Aufgrund einer Factoring-Vereinbarung sind unsere Forderungen an die SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart abgetreten. Zahlungen mit schuldbefreiender Wirkung können ausschließlich auf folgendes Konto geleistet werden:',
    '',
    'Name: Baden-Württembergische Bank',
    'IBAN: DE42 6005 0101 7482 0107 83',
    'BIC: SOLADEST600',
    '',
    'Bitte geben Sie bei der Überweisung die Kundennummer und die vollständige Rechnungsnummer ohne Leerzeichen oder Sonderzeichen, getrennt durch ein Komma, im Verwendungszweck an.',
    '',
    'Beanstandungen können nur innerhalb der folgenden 8 Tage berücksichtigt werden.',
    'Lieferung gemäß unseren allgemeinen Geschäftsbedingungen: siehe www.mtcon.eu/de/power2pcb/agb/',
  ],
  en: [
    'Under a factoring agreement, our receivables have been transferred to SüdFactoring GmbH, Pariser Platz 7, 70173 Stuttgart, Germany. Payment with debt-discharging effect can only be made to their account:',
    '',
    'Name: Baden-Württembergische Bank',
    'IBAN: DE42 6005 0101 7482 0107 83',
    'BIC: SOLADEST600',
    '',
    'When making the transfer, please state the customer number and the complete invoice number without spaces or special characters, separated by a comma, in the reference field.',
    '',
    'Complaints can only be considered within the following 8 days.',
    'Delivery according to our general terms and conditions of trade: see www.mtcon.eu/en/power2pcb/gcs/',
  ],
};

interface Fonts { regular: PDFFont; bold: PDFFont; }

async function loadTemplate(scope?: TemplateScope): Promise<ArrayBuffer> {
  return loadErpTemplateBytes('rechnung', templateUrl, scope);
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
  header: { pos: string; artNr: string; dn: string; qty: string; price: string; value: string };
  descriptionLines: string[];
  extraLines: string[];
  height: number;
}

/** Rechnung als PDF-Bytes; nutzt Overlay auf Original-Vorlage. */
export async function renderInvoiceOverlay(
  d: RechnungData,
  opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {},
): Promise<Uint8Array> {
  const tplBytes = await loadTemplate(opts.scope);
  const tplDoc = await PDFDocument.load(tplBytes);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const lang: Lang = (d.language ?? 'de') === 'en' ? 'en' : 'de';
  const unitWord = t('unitPcs', lang);
  const beschWidth = P.cols.value - 20 - P.cols.article;

  const blocks: PosBlock[] = d.items.map((it, idx) => {
    const posNo = it.pos != null && it.pos !== '' ? String(it.pos) : String((idx + 1) * 10);
    const qtyStr = it.quantity != null ? `${fmt.qty(it.quantity)} ${it.unit || unitWord}` : '';
    const priceStr = it.price != null
      ? `${fmt.currency(it.price, d.currency)} / ${it.unit || '1000'}` : '';
    const valueStr = it.positionValue != null ? fmt.currency(it.positionValue, d.currency) : '';
    const dn = it.deliveryNo
      ? `${it.deliveryNo}${it.deliveryDate ? ` ${t('from', lang)} ${fmt.date(it.deliveryDate, lang)}` : ''}`
      : '';
    const descLines: string[] = [];
    if (it.description) for (const l of it.description.split('\n')) descLines.push(...wrap(l, regular, 9, beschWidth));
    const extraLines: string[] = [];
    for (const ex of it.extraLines || []) for (const l of String(ex).split('\n')) extraLines.push(...wrap(l, regular, 9, beschWidth));
    const height = (1 + descLines.length + extraLines.length) * P.rowLine + 6;
    return {
      header: { pos: posNo, artNr: it.artNr || '', dn, qty: qtyStr, price: priceStr, value: valueStr },
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
  const totalPages = pagesOfBlocks.length + 1;

  const drawnPages: PDFPage[] = [];
  for (let i = 0; i < totalPages; i++) {
    const templatePageIndex = i === 0 ? 0 : Math.min(1, tplDoc.getPageCount() - 1);
    const [copied] = await pdf.copyPages(tplDoc, [templatePageIndex]);
    pdf.addPage(copied);
    drawnPages.push(copied);
  }

  const titleKey = d.docKind === 'credit_note' ? 'creditNoteNo' : d.docKind === 'storno' ? 'stornoNo' : 'invoiceNo';

  for (let i = 0; i < totalPages; i++) {
    const page = drawnPages[i];
    const isFirst = i === 0;
    const isLast = i === totalPages - 1;
    mask(page, isFirst ? MASKS_P1 : MASKS_PX);

    page.drawRectangle({ x: 335, y: topY(165), width: 225, height: 20, color: SHADE });
    txt(page, `${t(titleKey, lang)} ${d.invoiceNo}`, P.title.x, P.title.top, fonts,
      { size: P.title.size, bold: true });

    if (isFirst) {
      const recipientLines = [d.party.name, ...d.party.lines].filter(Boolean);
      recipientLines.forEach((line, li) => {
        txt(page, line, P.recipient.x, P.recipient.top + li * P.recipient.lineHeight, fonts,
          { size: P.recipient.size });
      });

      const metaRows: Array<[string, string | undefined | null]> = [
        [t('custNo', lang),  d.contact.customerNo ? String(d.contact.customerNo) : undefined],
        [t('contact', lang), d.contact.contactName],
        [t('phone', lang),   d.contact.phone],
        [t('fax', lang),     d.contact.fax],
        [t('email', lang),   d.contact.email],
        [t('vatId', lang),   d.contact.vatId],
        [t('subject', lang), d.contact.subject],
      ];
      let row = 0;
      for (const [label, value] of metaRows) {
        if (!value) continue;
        const y = P.metaLabel.top + row * P.metaLabel.lineHeight;
        txt(page, label, P.metaLabel.x, y, fonts, { size: P.metaLabel.size, bold: true });
        const valueLines = wrap(String(value), regular, P.metaValue.size, 120);
        valueLines.forEach((line, li) => txt(page, line, P.metaValue.x, y + li * P.metaLabel.lineHeight, fonts, { size: P.metaValue.size }));
        row += Math.max(1, valueLines.length);
      }

      const introText = d.docKind === 'credit_note' || d.docKind === 'storno'
        ? t('introCredit', lang) : t('intro', lang);
      txt(page, introText, P.intro.x, P.intro.top, fonts, { size: P.intro.size });
      if (d.currency === 'USD') {
        txt(page, t('currencyUsd', lang), P.intro.x, P.intro.top + P.intro.lineHeight, fonts,
          { size: P.intro.size, bold: true, red: true });
      }
    }

    const dateTop = isFirst ? P.dateLabel.top : 179;
    txt(page, t('date', lang), P.dateLabel.x, dateTop, fonts, { size: P.dateLabel.size, bold: true });
    txt(page, d.date, P.dateValue.x, dateTop, fonts, { size: P.dateValue.size });
    txt(page, `${t('page', lang)} ${i + 1} ${t('of', lang)} ${totalPages}`,
      P.pageValue.x, dateTop, fonts, { size: P.pageValue.size });

    if (i < pagesOfBlocks.length) {
      page.drawRectangle({ x: 45, y: topY(384), width: 525, height: 18, color: SHADE });
      txt(page, t('colPos', lang),     P.cols.pos,     P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, t('colArticle', lang), P.cols.article, P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, t('colDn', lang),      P.cols.dn,      P.headerRow.top, fonts, { size: P.headerRow.size, bold: true });
      txt(page, t('colQty', lang),     P.cols.menge,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
      txt(page, t('colPrice', lang),   P.cols.preis,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });
      txt(page, t('colValue', lang),   P.cols.value,   P.headerRow.top, fonts, { size: P.headerRow.size, bold: true, align: 'right' });

      let cursor = P.tableTop;
      for (const b of pagesOfBlocks[i] || []) {
        txt(page, b.header.pos, P.cols.pos, cursor, fonts, { size: 9, bold: true });
        if (b.header.artNr) txt(page, b.header.artNr, P.cols.article, cursor, fonts, { size: 9, bold: true });
        if (b.header.dn)    txt(page, b.header.dn,    P.cols.dn,      cursor, fonts, { size: 9 });
        if (b.header.qty)   txt(page, b.header.qty,   P.cols.menge,   cursor, fonts, { size: 9, align: 'right' });
        if (b.header.price) txt(page, b.header.price, P.cols.preis,   cursor, fonts, { size: 9, align: 'right' });
        if (b.header.value) txt(page, b.header.value, P.cols.value,   cursor, fonts, { size: 9, align: 'right' });
        cursor += P.rowLine;
        for (const l of b.descriptionLines) { txt(page, l, P.cols.article, cursor, fonts, { size: 9 }); cursor += P.rowLine; }
        for (const l of b.extraLines)       { txt(page, l, P.cols.article, cursor, fonts, { size: 9 }); cursor += P.rowLine; }
        cursor += 6;
      }
    }

    if (isLast) {
      page.drawLine({ start: { x: 70, y: topY(222) }, end: { x: 560, y: topY(222) }, thickness: 0.6, color: COLOR_TEXT });
      let totalsY = 238;
      const taxRate = d.taxRate ?? 19;
      const totals: Array<[string, string, boolean]> = [
        [t('net', lang), fmt.currency(d.subtotal ?? 0, d.currency), false],
        [`${lang === 'de' ? 'MwSt' : 'VAT'} ${taxRate.toFixed(2).replace('.', lang === 'de' ? ',' : '.')}%`,
          fmt.currency(d.tax ?? 0, d.currency), false],
        [t('total', lang), fmt.currency(d.total ?? 0, d.currency), true],
      ];
      for (const [label, value, boldRow] of totals) {
        txt(page, label, P.totalLabel.x, totalsY, fonts, { size: P.totalLabel.size, bold: true });
        txt(page, value, P.totalValue.x, totalsY, fonts, { size: P.totalValue.size, bold: boldRow, align: 'right' });
        totalsY += P.totalLabel.lineHeight;
      }

      let condY = 315;
      const drawCond = (label: string, value: string) => {
        const lines = String(value).split('\n');
        txt(page, label, P.condLabel.x, condY, fonts, { size: P.condLabel.size, bold: true });
        lines.forEach((l, li) => txt(page, l, P.condValue.x, condY + li * P.condLabel.lineHeight, fonts, { size: P.condValue.size }));
        condY += P.condLabel.lineHeight * lines.length;
      };
      if (d.paymentTerms) drawCond(t('payment', lang), d.paymentTerms);
      if (d.dueDate) drawCond(t('dueDate', lang), fmt.date(d.dueDate, lang));

      let noteY = condY + 16;
      const taxNoteKey: keyof typeof L | null =
        d.taxMode === 'reverse_charge' ? 'taxReverse' :
        d.taxMode === 'tax_free_eu' ? 'taxFreeEu' :
        d.taxMode === 'tax_free_third_country' ? 'taxFreeThird' :
        d.taxMode === 'small_business' ? 'taxSmall' : null;
      if (taxNoteKey) {
        for (const line of wrap(t(taxNoteKey, lang), bold, 8, 480)) {
          txt(page, line, P.condLabel.x, noteY, fonts, { size: 8, bold: true });
          noteY += 11;
        }
      }
      if (d.skontoPercent && d.skontoDays) {
        const skontoFn = L.skonto[lang] as (p: string, d: string) => string;
        txt(page, skontoFn(Number(d.skontoPercent).toFixed(2).replace('.', lang === 'de' ? ',' : '.'), String(d.skontoDays)),
          P.condLabel.x, noteY, fonts, { size: 8 });
        noteY += 11;
      }

      let y = noteY + 14;
      for (const [paraIndex, para] of FACTORING[lang].entries()) {
        const lines = para === '' ? [''] : wrap(para, bold, P.factoring.size, P.factoring.width);
        const isRedBlock = paraIndex <= 6;
        for (const line of lines) {
          if (line !== '') {
            txt(page, line, P.factoring.x, y, fonts, { size: P.factoring.size, bold: isRedBlock, red: isRedBlock });
          }
          y += P.factoring.lineHeight;
        }
      }
      y += 8;
      txt(page, lang === 'de' ? 'Mit freundlichen Grüßen' : 'Best regards', P.condLabel.x, y, fonts, { size: 9 });
      txt(page, 'MTCONNECTIVITY power2pcb GmbH', P.condLabel.x, y + 12, fonts, { size: 9 });
    }

    if (opts.demo) {
      page.drawText('DEMO', { x: 90, y: 240, size: 180, font: bold, color: COLOR_RED, opacity: 0.18, rotate: degrees(35) });
      page.drawText(lang === 'en' ? 'DEMO — not legally valid' : 'DEMO — nicht rechtsgültig',
        { x: 48, y: topY(60), size: 8, font: bold, color: COLOR_RED, opacity: 0.9 });
    }
  }

  drawStatusStamp(pdf, regular, opts.statusInfo);

  return await pdf.save();
}

/** Öffnet die Overlay-Rechnung in einem neuen Tab. */
export async function openInvoiceOverlayPdf(data: RechnungData, opts: { demo?: boolean; scope?: TemplateScope; statusInfo?: DocStatusInfo } = {}): Promise<void> {
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
