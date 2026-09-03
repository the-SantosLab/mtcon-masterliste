import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface MeetingMinutes {
  title: string;
  date: string;
  participants: string[];
  agenda_items: { topic: string; discussion: string; decisions: string[] }[];
  tasks: { title: string; assignee: string; due: string }[];
  summary: string;
  conclusion: string;
  case_no: string;
  case_title: string;
  client_name?: string | null;
}

export const MINUTES_NOTE_PREFIX = '[MTIQ – Besprechungsprotokoll]';
export const MINUTES_FILE_PREFIX = 'Protokoll_';

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');

/** Erzeugt das Besprechungsprotokoll als mehrseitiges A4-PDF. */
export function buildMeetingMinutesPdf(m: MeetingMinutes, createdBy?: string | null): jsPDF {
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
    doc.text(text, L, y);
    y += 1.5;
    doc.setDrawColor(200); doc.line(L, y, R, y);
    y += 5;
  };
  const para = (text: string, size = 9.5, indent = 0) => {
    if (!text) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(30);
    const lines = doc.splitTextToSize(text, R - L - indent) as string[];
    for (const ln of lines) { ensure(5); doc.text(ln, L + indent, y); y += 4.6; }
  };
  const bullet = (text: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30);
    const lines = doc.splitTextToSize(text, R - L - 6) as string[];
    lines.forEach((ln, i) => { ensure(5); if (i === 0) doc.text('•', L + 2, y); doc.text(ln, L + 6, y); y += 4.6; });
  };

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('MTCON', L, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Besprechungsprotokoll · erstellt mit MTIQ', L, 25);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(m.case_no, W - 20, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text(doc.splitTextToSize(m.case_title || '', 80) as string[], W - 20, 25, { align: 'right' });
  doc.setTextColor(0);

  y = 40;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(m.title, R - L) as string[];
  titleLines.forEach(ln => { doc.text(ln, L, y); y += 6.5; });
  y += 2;

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: 40 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32, textColor: 100 } },
    body: [
      ['Datum', fmtDate(m.date)],
      ['Vorgang', `${m.case_no} · ${m.case_title}`],
      ['Kunde', m.client_name || '–'],
      ['Teilnehmer', m.participants.length ? m.participants.join(', ') : '–'],
    ],
    margin: { left: L, right: 20 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  if (m.summary) { heading('Zusammenfassung'); para(m.summary); }

  if (m.agenda_items.length) {
    heading('Wesentliche Inhalte');
    m.agenda_items.forEach((a, i) => {
      ensure(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0);
      const t = doc.splitTextToSize(`${i + 1}. ${a.topic || 'Thema'}`, R - L) as string[];
      t.forEach(ln => { doc.text(ln, L, y); y += 5; });
      para(a.discussion);
      if (a.decisions.length) {
        y += 1;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80);
        ensure(5); doc.text('Beschlüsse', L, y); y += 4.5;
        a.decisions.forEach(bullet);
      }
      y += 3;
    });
  }

  if (m.tasks.length) {
    heading('Abgeleitete Aufgaben');
    autoTable(doc, {
      startY: y,
      head: [['#', 'Aufgabe', 'Verantwortlich', 'Fällig']],
      body: m.tasks.map((t, i) => [String(i + 1), t.title, t.assignee || '–', t.due ? fmtDate(t.due) : '–']),
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: 30 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 38 }, 3: { cellWidth: 24 } },
      margin: { left: L, right: 20, bottom: 25 },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  if (m.conclusion) { heading('Fazit'); para(m.conclusion); }

  // Fußzeile
  const pages = doc.getNumberOfPages();
  const created = new Date().toLocaleString('de-DE');
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140);
    doc.text(`Erstellt von MTIQ am ${created}${createdBy ? ` · ausgelöst durch ${createdBy}` : ''} · ${m.case_no}`, L, 288);
    doc.text(`Seite ${p}/${pages}`, W - 20, 288, { align: 'right' });
  }
  doc.setProperties({ title: `Besprechungsprotokoll ${m.case_no} ${m.date}` });
  return doc;
}

export function minutesFileName(m: MeetingMinutes): string {
  const safeNo = (m.case_no || 'Vorgang').replace(/[^\w.\-]+/g, '_');
  return `${MINUTES_FILE_PREFIX}${safeNo}_${m.date || new Date().toISOString().slice(0, 10)}.pdf`;
}
