import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEUR } from './crm';

export interface OfferPdfData {
  offer_no: string;
  created_at: string;
  valid_until?: string | null;
  version: number;
  company_name?: string;
  contact_name?: string;
  delivery_address?: string;
  items: { description: string; quantity: number; unit_price: number; discount_pct: number }[];
  payment_terms?: string;
  notes?: string;
}

export function generateOfferPdf(d: OfferPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;

  // Header
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('MTCON', 20, 20);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text('SantosLab GmbH · Hamburg · DE', 20, 25);
  doc.setTextColor(0);

  // Customer block
  doc.setFontSize(9);
  let y = 45;
  doc.text(d.company_name || '', 20, y); y += 4;
  if (d.contact_name) { doc.text(d.contact_name, 20, y); y += 4; }
  if (d.delivery_address) {
    d.delivery_address.split('\n').forEach(l => { doc.text(l, 20, y); y += 4; });
  }

  // Right meta
  doc.setFontSize(9);
  const dt = new Date(d.created_at).toLocaleDateString('de-DE');
  const vu = d.valid_until ? new Date(d.valid_until).toLocaleDateString('de-DE') : '–';
  doc.text(`Datum: ${dt}`, W - 20, 45, { align: 'right' });
  doc.text(`Gültig bis: ${vu}`, W - 20, 50, { align: 'right' });
  doc.text(`Version: ${d.version}`, W - 20, 55, { align: 'right' });

  // Title
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(`Angebot ${d.offer_no}`, 20, 80);
  doc.setFont('helvetica', 'normal');

  // Items
  const rows = d.items.map((it, i) => {
    const line = it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100);
    return [
      (i + 1).toString(),
      it.description,
      it.quantity.toString(),
      formatEUR(it.unit_price),
      `${it.discount_pct || 0}%`,
      formatEUR(line),
    ];
  });
  const net = d.items.reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0);
  const vat = net * 0.19;
  const gross = net + vat;

  autoTable(doc, {
    startY: 88,
    head: [['#', 'Beschreibung', 'Menge', 'Einzelpreis', 'Rabatt', 'Gesamt']],
    body: rows,
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' } },
  });

  let yEnd = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(9);
  doc.text(`Netto: ${formatEUR(net)}`, W - 20, yEnd, { align: 'right' }); yEnd += 5;
  doc.text(`MwSt (19%): ${formatEUR(vat)}`, W - 20, yEnd, { align: 'right' }); yEnd += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Brutto: ${formatEUR(gross)}`, W - 20, yEnd, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  yEnd += 12;

  if (d.payment_terms) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Zahlungsbedingungen', 20, yEnd); yEnd += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    d.payment_terms.split('\n').forEach(l => { doc.text(l, 20, yEnd); yEnd += 4; });
    yEnd += 4;
  }
  if (d.notes) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Anmerkungen', 20, yEnd); yEnd += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    d.notes.split('\n').forEach(l => { doc.text(l, 20, yEnd); yEnd += 4; });
  }

  return doc;
}
