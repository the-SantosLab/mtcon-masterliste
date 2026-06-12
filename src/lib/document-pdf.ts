import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtEUR = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('de-DE') : '–';

function header(doc: jsPDF, title: string, no: string) {
  const W = 210;
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('MTCON', 20, 20);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
  doc.text('SantosLab GmbH · Hamburg · DE', 20, 25);
  doc.setTextColor(0);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(`${title} ${no}`, W - 20, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
}

function addressBlock(doc: jsPDF, lines: (string | null | undefined)[], y = 45) {
  doc.setFontSize(9);
  for (const l of lines) {
    if (!l) continue;
    l.split('\n').forEach(line => { doc.text(line, 20, y); y += 4; });
  }
  return y;
}

export interface DeliveryPdfData {
  delivery_no: string;
  delivery_date?: string | null;
  carrier?: string | null;
  tracking_no?: string | null;
  ship_to?: string | null;
  notes?: string | null;
  order_no?: string | null;
  customer_name?: string | null;
  items: { position: number; art_nr: string | null; description: string; quantity: number; unit: string | null; lot_no?: string | null; serial_no?: string | null }[];
}

export function generateDeliveryPdf(d: DeliveryPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  header(doc, 'Lieferschein', d.delivery_no);

  addressBlock(doc, [d.customer_name, d.ship_to]);

  doc.setFontSize(9);
  doc.text(`Datum: ${fmtDate(d.delivery_date)}`, W - 20, 45, { align: 'right' });
  if (d.order_no) doc.text(`Bestellung: ${d.order_no}`, W - 20, 50, { align: 'right' });
  if (d.carrier) doc.text(`Spedition: ${d.carrier}`, W - 20, 55, { align: 'right' });
  if (d.tracking_no) doc.text(`Tracking: ${d.tracking_no}`, W - 20, 60, { align: 'right' });

  autoTable(doc, {
    startY: 80,
    head: [['#', 'Artikel', 'Bezeichnung', 'Menge', 'Charge / SN']],
    body: d.items.map(it => [
      it.position.toString(),
      it.art_nr || '—',
      it.description,
      `${it.quantity} ${it.unit || ''}`.trim(),
      [it.lot_no, it.serial_no].filter(Boolean).join(' / ') || '—',
    ]),
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 10 }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 40 } },
  });

  let y = (doc as any).lastAutoTable.finalY + 10;
  if (d.notes) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Anmerkungen', 20, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    d.notes.split('\n').forEach(l => { doc.text(l, 20, y); y += 4; });
  }
  y += 20;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Ware geprüft und vollständig erhalten:', 20, y);
  doc.line(20, y + 15, 90, y + 15);
  doc.text('Datum, Unterschrift', 20, y + 19);

  return doc;
}

export interface InvoicePdfData {
  invoice_no: string;
  invoice_date?: string | null;
  due_date?: string | null;
  customer_name?: string | null;
  customer_no?: string | null;
  billing_address?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  currency: string;
  items: { position: number; art_nr: string | null; description: string; quantity: number; unit: string | null; unit_price: number | null; tax_rate: number | null; line_total: number | null }[];
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
}

export function generateInvoicePdf(d: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  header(doc, 'Rechnung', d.invoice_no);

  addressBlock(doc, [d.customer_name, d.billing_address]);

  doc.setFontSize(9);
  doc.text(`Rechnungsdatum: ${fmtDate(d.invoice_date)}`, W - 20, 45, { align: 'right' });
  doc.text(`Fällig am: ${fmtDate(d.due_date)}`, W - 20, 50, { align: 'right' });
  if (d.customer_no) doc.text(`Kunden-Nr.: ${d.customer_no}`, W - 20, 55, { align: 'right' });

  autoTable(doc, {
    startY: 80,
    head: [['#', 'Artikel', 'Bezeichnung', 'Menge', 'EP', 'USt%', 'Summe']],
    body: d.items.map(it => [
      it.position.toString(),
      it.art_nr || '—',
      it.description,
      `${it.quantity} ${it.unit || ''}`.trim(),
      it.unit_price != null ? fmtEUR(Number(it.unit_price)) : '—',
      it.tax_rate != null ? `${it.tax_rate}%` : '—',
      it.line_total != null ? fmtEUR(Number(it.line_total)) : '—',
    ]),
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 8 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(9);
  doc.text(`Netto: ${fmtEUR(Number(d.subtotal_amount || 0))}`, W - 20, y, { align: 'right' }); y += 5;
  doc.text(`USt.: ${fmtEUR(Number(d.tax_amount || 0))}`, W - 20, y, { align: 'right' }); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Gesamt: ${fmtEUR(Number(d.total_amount || 0))}`, W - 20, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 12;

  if (d.payment_terms) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Zahlungsbedingungen', 20, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    d.payment_terms.split('\n').forEach(l => { doc.text(l, 20, y); y += 4; });
    y += 4;
  }
  if (d.notes) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Anmerkungen', 20, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    d.notes.split('\n').forEach(l => { doc.text(l, 20, y); y += 4; });
  }

  return doc;
}
