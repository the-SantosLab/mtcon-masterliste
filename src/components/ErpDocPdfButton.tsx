import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { openErpPdf, ErpDocType } from '@/lib/erp-pdf/fetch';

interface Props {
  type: ErpDocType;
  id: string;
  label?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  className?: string;
  iconOnly?: boolean;
}

/**
 * Universeller PDF-Button für ERP-Belege (Angebot, AB, Bestellung,
 * Lieferschein, Rücklieferschein, Rechnung). Lädt Daten und öffnet PDF im
 * neuen Tab im MTCON / POWER2PCB-Layout.
 */
export function ErpDocPdfButton({ type, id, label = 'PDF', size = 'sm', variant = 'outline', className, iconOnly }: Props) {
  const [loading, setLoading] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    setLoading(true);
    try {
      await openErpPdf(type, id);
    } catch (err: any) {
      toast.error('PDF konnte nicht erzeugt werden: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button type="button" size={iconOnly ? 'icon' : size} variant={variant} onClick={onClick} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      {!iconOnly && <span className="ml-1">{label}</span>}
    </Button>
  );
}
