import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Loader2, Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildErpPdf, ErpDocType } from '@/lib/erp-pdf/fetch';
import type jsPDF from 'jspdf';

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

export function ErpDocPdfButton({ type, id, label = 'PDF', size = 'sm', variant = 'outline', className, iconOnly }: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<jsPDF | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('dokument.pdf');

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true);
    try {
      const d = await buildErpPdf(type, id);
      const blob = d.output('blob') as Blob;
      const url = URL.createObjectURL(blob);
      // Titel aus PDF-Metadaten für Dateinamen nutzen, wenn gesetzt
      const meta: any = (d as any).internal?.getDocumentProperties?.() ?? {};
      const base = (meta.title || `${TYPE_LABEL[type]}`).toString().replace(/[^\w.\-]+/g, '_');
      setFileName(`${base}.pdf`);
      setDoc(d);
      setPreviewUrl(url);
      setOpen(true);
    } catch (err: any) {
      toast.error('PDF konnte nicht erzeugt werden: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleClose = (o: boolean) => {
    if (!o) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setDoc(null);
    }
    setOpen(o);
  };

  const download = () => {
    if (!doc) return;
    doc.save(fileName);
  };

  const openInTab = () => {
    if (previewUrl) window.open(previewUrl, '_blank');
  };

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? 'icon' : size}
        variant={variant}
        onClick={onClick}
        disabled={loading}
        className={className}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {!iconOnly && <span className="ml-1">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-4 pb-2 border-b border-border/50">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Vorschau — {TYPE_LABEL[type]}
              <span className="text-xs text-muted-foreground font-normal ml-2">{fileName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-[60vh] bg-muted/30">
            {previewUrl && (
              <iframe
                src={`${previewUrl}#toolbar=0&navpanes=0`}
                title="PDF-Vorschau"
                className="w-full h-full min-h-[60vh]"
              />
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={openInTab}>
              <ExternalLink className="h-4 w-4 mr-1" /> In neuem Tab
            </Button>
            <Button type="button" size="sm" onClick={download}>
              <Download className="h-4 w-4 mr-1" /> Herunterladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
