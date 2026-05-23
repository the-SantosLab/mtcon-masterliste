import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onForceSave: () => void;
  onReload: () => void;
}

export function CaseConflictDialog({ open, onOpenChange, onForceSave, onReload }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Konflikt erkannt
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ein anderer Nutzer hat diesen Vorgang in der Zwischenzeit geändert. Was möchtest du tun?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button size="sm" className="w-full h-8 text-xs" onClick={onForceSave}>
            Meine Änderungen speichern
          </Button>
          <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={onReload}>
            Aktuelle Version laden
          </Button>
          <Button size="sm" variant="ghost" className="w-full h-8 text-xs" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
