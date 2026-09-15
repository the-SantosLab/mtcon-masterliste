// Kleiner Statusstreifen am unteren Rand jedes Beleg-Layouts:
// zeigt Beleg-/Vorgangsstatus, das Datum des Ausdrucks und einen
// anklickbaren Link zum zugehörigen Vorgang.
import { PDFDocument, PDFFont, PDFName, PDFString, PDFArray, rgb } from 'pdf-lib';

export interface DocStatusInfo {
  /** Status des Belegs, z. B. "Versendet" */
  docStatus?: string | null;
  /** ID des verknüpften Vorgangs (für den Link) */
  caseId?: string | null;
  /** Nummer des verknüpften Vorgangs, z. B. "V-2026-0042" */
  caseNo?: string | null;
  /** Status des verknüpften Vorgangs, z. B. "In Arbeit" */
  caseStatus?: string | null;
}

const GRAY = rgb(0.45, 0.45, 0.45);
const LINK = rgb(0.13, 0.35, 0.72);
const BASE_Y = 26;
const BASE_X = 45;
const SIZE = 7;

export function buildStatusLine(info: DocStatusInfo | undefined): string | null {
  const parts: string[] = [];
  if (info?.docStatus) parts.push(`Belegstatus: ${info.docStatus}`);
  if (info?.caseStatus) parts.push(`Vorgang${info.caseNo ? ' ' + info.caseNo : ''}: ${info.caseStatus}`);
  if (!parts.length) return null;
  parts.push(`Stand: ${new Date().toLocaleDateString('de-DE')}`);
  return parts.join('  ·  ');
}

/** Absolute URL zur Vorgangs-Übersicht bzw. zum einzelnen Vorgang. */
function caseUrl(caseId: string): string {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://mtcon.kscommand.com';
  return `${origin}/cases/${caseId}`;
}

/** Zeichnet den Statusstreifen (inkl. Vorgangs-Link) auf jede Seite. */
export function drawStatusStamp(pdf: PDFDocument, font: PDFFont, info: DocStatusInfo | undefined): void {
  const line = buildStatusLine(info);
  if (!line) return;

  const linkText = info?.caseId ? 'Vorgang öffnen ›' : null;
  const url = info?.caseId ? caseUrl(info.caseId) : null;
  const lineWidth = font.widthOfTextAtSize(line, SIZE);
  const linkX = BASE_X + lineWidth + 10;

  for (const page of pdf.getPages()) {
    page.drawText(line, { x: BASE_X, y: BASE_Y, size: SIZE, font, color: GRAY });
    if (!linkText || !url) continue;

    page.drawText(linkText, { x: linkX, y: BASE_Y, size: SIZE, font, color: LINK });
    const w = font.widthOfTextAtSize(linkText, SIZE);
    const annot = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [linkX - 1, BASE_Y - 2, linkX + w + 1, BASE_Y + SIZE + 2],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      }),
    );
    const existing = page.node.lookup(PDFName.of('Annots'), PDFArray);
    if (existing) existing.push(annot);
    else page.node.set(PDFName.of('Annots'), pdf.context.obj([annot]));
  }
}
