import jsPDF from 'jspdf';

export interface TranslatedDoc {
  title: string;
  source_language: string | null;
  target_language: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/** Erzeugt aus dem MTIQ-Übersetzungsergebnis ein mehrseitiges A4-PDF. */
export function buildTranslatedPdf(d: TranslatedDoc, originalFileName?: string | null, createdBy?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 20, R = 190, BOTTOM = 275;
  let y = 0;

  const ensure = (need: number) => {
    if (y + need > BOTTOM) { doc.addPage(); y = 22; }
  };
  const heading = (text: string) => {
    ensure(14);
    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, R - L) as string[];
    lines.forEach(ln => { ensure(7); doc.text(ln, L, y); y += 5.5; });
    y += 1;
    doc.setDrawColor(200); doc.line(L, y, R, y);
    y += 5;
  };
  const para = (text: string) => {
    if (!text) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30);
    const lines = doc.splitTextToSize(text, R - L) as string[];
    for (const ln of lines) { ensure(5); doc.text(ln, L, y); y += 4.6; }
    y += 2;
  };

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('MTCON', L, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Übersetzung · erstellt mit MTIQ${d.source_language ? ` · ${d.source_language} → ${d.target_language}` : ''}`, L, 25);
  if (originalFileName) {
    doc.text(doc.splitTextToSize(`Original: ${originalFileName}`, 90) as string[], W - 20, 20, { align: 'right' });
  }
  doc.setTextColor(0);

  y = 40;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(d.title, R - L) as string[];
  titleLines.forEach(ln => { doc.text(ln, L, y); y += 6.5; });
  y += 4;

  d.sections.forEach(s => {
    if (s.heading) heading(s.heading);
    s.paragraphs.forEach(para);
  });

  // Fußzeile
  const pages = doc.getNumberOfPages();
  const created = new Date().toLocaleString('de-DE');
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140);
    doc.text(`Übersetzung erstellt von MTIQ am ${created}${createdBy ? ` · ${createdBy}` : ''} · maschinelle Übersetzung, bitte prüfen`, L, 288);
    doc.text(`Seite ${p}/${pages}`, W - 20, 288, { align: 'right' });
  }
  doc.setProperties({ title: `Übersetzung ${d.title}` });
  return doc;
}

export function translatedFileName(d: TranslatedDoc, originalFileName?: string | null): string {
  const base = (originalFileName || d.title || 'Dokument').replace(/\.pdf$/i, '').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  return `${base}_UEBERSETZUNG.pdf`;
}
