import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export function LookalikeDialog({ company, open, onClose }: { company: any; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Suche nach: ${company?.industry ?? '[Branche fehlt]'} Unternehmen in ${company?.country ?? '[Land fehlt]'}, ähnlich wie ${company?.name}.\n\nKriterien:\n- Branche: ${company?.industry ?? '–'}\n- Land: ${company?.country ?? '–'}\n- Unternehmensgröße: vergleichbar mit ${company?.name}\n- Website-Beispiel: ${company?.website ?? '–'}`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('In Zwischenablage kopiert');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Look-a-like-Kriterien</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">Nutze diese Kriterien für Apollo, LinkedIn Sales Navigator oder ähnliche Tools.</p>
        <Textarea value={text} readOnly className="text-xs font-mono min-h-[180px]" />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Schließen</Button>
          <Button size="sm" onClick={copy} className="h-8 text-xs gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Kopieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
