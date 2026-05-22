import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { NotifyToggle } from '@/components/NotifyToggle';
import { MtiqButton } from '@/components/MtiqButton';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (note: string, sendEmail: boolean) => Promise<void> | void;
  lastSentAt?: string | null;
}

const MIN_CHARS = 10;

export function CompleteCaseDialog({ open, onOpenChange, onConfirm, lastSentAt }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const reset = () => { setNote(''); setSaving(false); setSendEmail(true); };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleConfirm = async () => {
    if (note.trim().length < MIN_CHARS) return;
    setSaving(true);
    try {
      await onConfirm(note.trim(), sendEmail);
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const remaining = Math.max(0, MIN_CHARS - note.trim().length);
  const disabled = saving || note.trim().length < MIN_CHARS;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Vorgang abschließen</DialogTitle>
          <DialogDescription className="text-xs">
            Bitte hinterlege eine kurze Abschlussnotiz. Sie wird in den Notizen gespeichert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            Abschlussnotiz <span className="text-destructive">(Pflichtfeld)</span>
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Was wurde abgeschlossen? Ergebnis, Übergabe, offene Punkte…"
            className="text-xs min-h-[120px]"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground">
            {remaining > 0
              ? `Noch ${remaining} Zeichen bis zum Mindestmaß (${MIN_CHARS}).`
              : `${note.trim().length} Zeichen.`}
          </p>
        </div>
        <div className="border-t border-border pt-3">
          <NotifyToggle
            checked={sendEmail}
            onChange={setSendEmail}
            lastSentAt={lastSentAt}
            recipientsHint="Ersteller, Bearbeiter, Watcher"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleConfirm} disabled={disabled}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Abschließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
