// Shared MTCON / POWER2PCB pixel-nahe PDF-Layout-Bibliothek.
// Alle ERP-Belege (Angebot, Auftragsbestätigung, Bestellung, Lieferschein, Rechnung)
// nutzen genau diesen Renderer, damit Kopf / Fuß / Meta konsistent bleiben.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const PAGE = { W: 210, H: 297, ML: 20, MR: 20, MT: 14, MB: 14 } as const;
export const COLORS = {
  power2pcbGray: [88, 89, 91] as [number, number, number],   // "POWER" / "PCB"
  power2pcbGold: [232, 178, 20] as [number, number, number], // "2"
  mtconDark: [45, 45, 48] as [number, number, number],       // MTCON text
  mtconOrange: [235, 168, 20] as [number, number, number],   // Speech-bubble dot
  accentRed: [200, 30, 30] as [number, number, number],      // Currency notice + factoring
  ink: [30, 30, 30] as [number, number, number],
  mute: [110, 110, 110] as [number, number, number],
  rule: [180, 180, 180] as [number, number, number],
  shade: [232, 232, 232] as [number, number, number],
};

export type L = 'de' | 'en';

export interface HeaderMeta {
  docTitle: string;                  // "Angebot Nr.", "Invoice No.", ...
  docNo: string;                     // "16120-01"
  metaRows: { label: string; value: string }[]; // rechter Metablock
  recipient: string[];               // Anschriftszeilen links
  senderLine: string;                // klein unterstrichen über Empfänger
  intro?: string;                    // Einleitungssatz
  date: string;                      // "06.05.2026"
  dateLabel: string;                 // "Datum" / "Date"
  pageLabel: string;                 // "Seite" / "Page"
  pageOfWord: string;                // "von" / "from"
  language: L;
}

export interface FooterBlock {
  companyLine: string;               // "MTCONNECTIVITY power2pcb GmbH \ Rathausgässle 5 \ ..."
  legalLine: string;                 // "Geschäftsführer: Mario Tolj \ ..."
  bankLine: string;                  // "BW-Bank ..."
}

export const DEFAULT_FOOTER: FooterBlock = {
  companyLine:
    'MTCONNECTIVITY power2pcb GmbH  \\  Rathausgässle 5  \\  74676 Niedernhall  \\  Telefon: +49 7940 989998-0',
  legalLine:
    'Fax: +49 7940 989998-9  \\  info@mtcon.eu  \\  www.mtcon.eu\nGeschäftsführer: Mario Tolj  \\  Gerichtsstand Stuttgart  \\  HRB 737643  \\  Erfüllungsort Niedernhall  \\  USt-IdNr. DE277204235',
  bankLine: 'BW-Bank Stuttgart  \\  IBAN: DE92 6005 0101 0002 3397 86  \\  BIC: SOLADEST600',
};


// -------- Brand marks (vektorisiert, kein Bild-Asset nötig) --------
function drawBrandMark(doc: jsPDF) {
  // POWER2PCB links: "POWER" grau, "2" gold, "PCB" grau
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  const yLogo = 30;
  doc.setTextColor(...COLORS.power2pcbGray);
  doc.text('POWER', PAGE.ML, yLogo);
  const wPower = doc.getTextWidth('POWER');
  doc.setTextColor(...COLORS.power2pcbGold);
  doc.text('2', PAGE.ML + wPower + 0.5, yLogo);
  const w2 = doc.getTextWidth('2');
  doc.setTextColor(...COLORS.power2pcbGray);
  doc.text('PCB', PAGE.ML + wPower + w2 + 1, yLogo);

  // MTCON Wortmarke rechts oben (Sprechblase + gestapeltes MTCON / NECT / IVITY)
  const bubbleCx = PAGE.W - PAGE.MR - 3;
  const bubbleCy = 16;
  const r = 5.5;
  doc.setFillColor(...COLORS.mtconDark);
  doc.circle(bubbleCx, bubbleCy, r, 'F');
  // "Tail" der Sprechblase (kleines Dreieck unten links)
  doc.triangle(
    bubbleCx - r + 1.5, bubbleCy + 3,
    bubbleCx - r - 1, bubbleCy + 5.5,
    bubbleCx - r + 3, bubbleCy + 5,
    'F',
  );
  // Gold dot inside bubble
  doc.setFillColor(...COLORS.mtconOrange);
  doc.circle(bubbleCx - 1, bubbleCy, 1.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.mtconDark);
  const textX = bubbleCx - r - 2;
  doc.text('MTCON', textX, bubbleCy - 1, { align: 'right' });
  doc.text('NECT', textX, bubbleCy + 3.5, { align: 'right' });
  doc.text('IVITY', textX, bubbleCy + 8, { align: 'right' });

  doc.setTextColor(...COLORS.ink);
}

function drawSenderLine(doc: jsPDF, senderLine: string, y = 48) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mute);
  doc.text(senderLine, PAGE.ML, y);
  doc.setDrawColor(...COLORS.mute);
  doc.setLineWidth(0.2);
  const w = doc.getTextWidth(senderLine);
  doc.line(PAGE.ML, y + 0.6, PAGE.ML + w, y + 0.6);
  doc.setTextColor(...COLORS.ink);
}

function drawRecipient(doc: jsPDF, lines: string[], y = 54) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  for (const l of lines.filter(Boolean)) {
    doc.text(l, PAGE.ML, y);
    y += 4.8;
  }
  return y;
}

function drawMetaBox(
  doc: jsPDF,
  meta: HeaderMeta,
  y = 48,
) {
  const rightX = PAGE.W - PAGE.MR;
  const boxX = rightX - 85;
  const boxW = 85;

  // Grau hinterlegte Titelzeile
  doc.setFillColor(...COLORS.shade);
  doc.rect(boxX, y - 4, boxW, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.ink);
  doc.text(`${meta.docTitle} ${meta.docNo}`, boxX + 2, y);

  const labelX = boxX + 2;
  const valueX = boxX + 30;
  doc.setFontSize(9);
  let py = y + 8;
  for (const r of meta.metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.text(r.label, labelX, py);
    doc.setFont('helvetica', 'normal');
    doc.text(r.value ?? '', valueX, py);
    py += 4.5;
  }
  return py;
}

function drawDateAndPage(doc: jsPDF, meta: HeaderMeta, pageNo: number, pageCount: number, y = 88) {
  const rightX = PAGE.W - PAGE.MR;
  const boxX = rightX - 85;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(meta.dateLabel, boxX + 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(meta.date, boxX + 30, y);
  doc.text(`${meta.pageLabel} ${pageNo} ${meta.pageOfWord} ${pageCount}`, rightX, y, { align: 'right' });
}

// Fuß: rechtsbündig auf jeder Seite (wie Muster)
function drawFooter(doc: jsPDF, footer: FooterBlock) {
  const rightX = PAGE.W - PAGE.MR;
  const y = PAGE.H - 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.mute);
  let py = y;
  const write = (t: string) => {
    t.split('\n').forEach(line => { doc.text(line, rightX, py, { align: 'right' }); py += 3.2; });
  };
  write(footer.companyLine);
  write(footer.legalLine);
  write(footer.bankLine);
  doc.setTextColor(...COLORS.ink);
}


export interface RenderTableOpts {
  startY?: number;
  head: string[];
  body: (string | number)[][];
  columnStyles?: any;
  footNote?: string;
  totals?: { label: string; value: string; bold?: boolean }[];
  conditions?: { label: string; value: string }[];
  legend?: string;                        // R=Rahmen A=Abruf ...
  closing?: string;                       // "Mit freundlichen Grüßen"
}

export interface RenderDocInput {
  meta: HeaderMeta;
  footer?: FooterBlock;
  table: RenderTableOpts;
}

export function renderDocument(input: RenderDocInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const footer = input.footer ?? DEFAULT_FOOTER;

  // Wir zeichnen Kopf auf JEDER Seite (Ausnahme: kleiner Rahmen unter Kopf für Empfänger nur Seite 1)
  // autoTable didDrawPage übernimmt das Zeichnen ab Seite 2.

  const paintHeaderFull = () => {
    drawBrandMark(doc);
    drawSenderLine(doc, input.meta.senderLine);
    drawRecipient(doc, input.meta.recipient);
    drawMetaBox(doc, input.meta);
  };
  const paintHeaderCompact = () => {
    drawBrandMark(doc);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${input.meta.docTitle} ${input.meta.docNo}`, PAGE.MR, 36);
  };

  paintHeaderFull();
  if (input.meta.intro) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(input.meta.intro, PAGE.ML, 76, { maxWidth: PAGE.W - PAGE.ML - PAGE.MR });
  }

  const startY = input.table.startY ?? 92;

  autoTable(doc, {
    startY,
    head: [input.table.head],
    body: input.table.body,
    styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.ink, lineColor: COLORS.rule, lineWidth: 0.1 },
    headStyles: { fillColor: [245, 245, 245], textColor: COLORS.ink, fontStyle: 'bold', lineColor: COLORS.rule, lineWidth: 0.1 },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: input.table.columnStyles || {},
    margin: { left: PAGE.ML, right: PAGE.MR, top: 44, bottom: 30 },
    showHead: 'everyPage',
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        paintHeaderCompact();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(input.meta.dateLabel, PAGE.ML, 44);
        doc.setFont('helvetica', 'normal');
        doc.text(input.meta.date, PAGE.ML + 18, 44);
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;

  // Totals rechtsbündig
  if (input.table.totals?.length) {
    const rightX = PAGE.W - PAGE.MR;
    const labelX = rightX - 55;
    doc.setFontSize(9);
    for (const t of input.table.totals) {
      doc.setFont('helvetica', t.bold ? 'bold' : 'normal');
      doc.text(t.label, labelX, y);
      doc.text(t.value, rightX, y, { align: 'right' });
      y += 5;
    }
    doc.setFont('helvetica', 'normal');
    y += 4;
  }

  // Konditionen
  if (input.table.conditions?.length) {
    doc.setFontSize(9);
    for (const c of input.table.conditions) {
      doc.setFont('helvetica', 'bold');
      doc.text(c.label, PAGE.ML, y);
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(c.value, PAGE.W - PAGE.ML - PAGE.MR - 40);
      doc.text(wrapped, PAGE.ML + 40, y);
      y += 4 * Math.max(1, Array.isArray(wrapped) ? wrapped.length : 1);
    }
    y += 4;
  }

  if (input.table.legend) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mute);
    doc.text(input.table.legend, PAGE.ML, y);
    doc.setTextColor(...COLORS.ink);
    y += 4;
  }

  if (input.table.footNote) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mute);
    const lines = doc.splitTextToSize(input.table.footNote, PAGE.W - PAGE.ML - PAGE.MR);
    doc.text(lines, PAGE.ML, y);
    doc.setTextColor(...COLORS.ink);
    y += 4 * (Array.isArray(lines) ? lines.length : 1);
  }

  if (input.table.closing) {
    y = Math.max(y, PAGE.H - 40);
    doc.setFontSize(9);
    doc.text(input.table.closing, PAGE.ML, y);
    y += 4;
    doc.text('MTCONNECTIVITY power2pcb GmbH', PAGE.ML, y);
  }

  // Fuß nur auf Seite 1
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawDateAndPage(doc, input.meta, i, totalPages);
    if (i === 1) drawFooter(doc, footer);
  }

  return doc;
}

// ---------- Format-Utilities ----------
export const fmt = {
  eur: (n: number | null | undefined) =>
    (Number(n ?? 0)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR',
  usd: (n: number | null | undefined) =>
    (Number(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $',
  currency: (n: number | null | undefined, code: string) => {
    if (code === 'USD') return fmt.usd(n);
    return fmt.eur(n);
  },
  qty: (n: number | null | undefined) =>
    (Number(n ?? 0)).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: (s?: string | null, lang: L = 'de') => {
    if (!s) return '–';
    const d = new Date(s);
    return lang === 'en'
      ? d.toLocaleDateString('en-GB')
      : d.toLocaleDateString('de-DE');
  },
};
