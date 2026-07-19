import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { buildErpPdf, ErpDocType } from '@/lib/erp-pdf/fetch';
import { enqueuePdfJob } from '@/lib/pdfJobs';

interface Props {
  type: ErpDocType;
  id: string;
  label?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  className?: string;
  iconOnly?: boolean;
}

const TYPE_LABEL: Record<ErpDocType, string> = {
  angebot: 'Angebot',
  ab: 'Auftragsbestätigung',
  bestellung: 'Bestellung',
  lieferschein: 'Lieferschein',
  ruecklieferschein: 'Rücklieferschein',
  rechnung: 'Rechnung',
};

/**
 * Startet die PDF-Generierung als Hintergrund-Job (siehe pdfJobs).
 * Der Klick kehrt sofort zurück; Fortschritt & Vorschau erscheinen im
 * schwebenden PdfJobToaster (rechts unten, global gemountet).
 */
export function ErpDocPdfButton({ type, id, label = 'PDF', size = 'sm', variant = 'outline', className, iconOnly }: Props) {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    enqueuePdfJob({
      label: `${TYPE_LABEL[type]} · ${id.slice(0, 8)}`,
      autoPreview: false,
      build: async (report) => {
        try {
          const doc = await buildErpPdf(type, id, report);
          const meta: any = (doc as any).internal?.getDocumentProperties?.() ?? {};
          const base = (meta.title || TYPE_LABEL[type]).toString().replace(/[^\w.\-]+/g, '_');
          return { doc, fileName: `${base}.pdf` };
        } catch (err: any) {
          toast.error('PDF konnte nicht erzeugt werden: ' + (err?.message || String(err)));
          throw err;
        }
      },
    });
  };
  return (
    <Button
      type="button"
      size={iconOnly ? 'icon' : size}
      variant={variant}
      onClick={onClick}
      className={className}
    >
      <FileText className="h-4 w-4" />
      {!iconOnly && <span className="ml-1">{label}</span>}
    </Button>
  );
}
