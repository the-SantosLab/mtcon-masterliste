// Kleiner Statusstreifen am unteren Rand jedes Beleg-Layouts:
// zeigt Beleg-/Vorgangsstatus und das Datum des Ausdrucks.
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';

export interface DocStatusInfo {
  /** Status des Belegs, z. B. "Versendet" */
  docStatus?: string | null;
  /** Nummer des verknüpften Vorgangs, z. B. "V-2026-0042" */
  caseNo?: string | null;
  /** Status des verknüpften Vorgangs, z. B. "In Arbeit" */
  caseStatus?: string | null;
}

const GRAY = rgb(0.45, 0.45, 0.45);

export function buildStatusLine(info: DocStatusInfo | undefined): string | null {
  const parts: string[] = [];
  if (info?.docStatus) parts.push(`Belegstatus: ${info.docStatus}`);
  if (info?.caseStatus) parts.push(`Vorgang${info.caseNo ? ' ' + info.caseNo : ''}: ${info.caseStatus}`);
  if (!parts.length) return null;
  parts.push(`Stand: ${new Date().toLocaleDateString('de-DE')}`);
  return parts.join('  ·  ');
}

/** Zeichnet den Statusstreifen auf jede Seite des Dokuments. */
export function drawStatusStamp(pdf: PDFDocument, font: PDFFont, info: DocStatusInfo | undefined): void {
  const line = buildStatusLine(info);
  if (!line) return;
  for (const page of pdf.getPages()) {
    page.drawText(line, { x: 45, y: 26, size: 7, font, color: GRAY });
  }
}
