import { useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { TextDiffView } from '@/components/TextDiffView';

interface MtiqButtonProps {
  text: string;
  onResult: (newText: string) => void;
  disabled?: boolean;
  minChars?: number;
  className?: string;
  label?: string;
}

export function MtiqButton({
  text,
  onResult,
  disabled,
  minChars = 10,
  className,
  label = 'Mit MTIQ formulieren',
}: MtiqButtonProps) {
  const [loading, setLoading] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [original, setOriginal] = useState('');
  const [proposed, setProposed] = useState('');
  const trimmed = (text || '').trim();
  const isDisabled = disabled || loading || trimmed.length < minChars;

  const run = async () => {
    if (isDisabled) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-reformulate', {
        body: { text: trimmed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        setOriginal(trimmed);
        setProposed(String(data.text));
        setDiffOpen(true);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Fehler bei MTIQ');
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    onResult(proposed);
    setDiffOpen(false);
    toast.success('Übernommen');
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary', className)}
        disabled={isDisabled}
        onClick={run}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {label}
      </Button>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              MTIQ-Vorschlag prüfen
            </DialogTitle>
            <DialogDescription>
              Änderungen sind farblich markiert. Rot = entfernt, Grün = neu.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-[50vh] overflow-y-auto">
            <TextDiffView before={original} after={proposed} />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setDiffOpen(false)} className="gap-1.5">
              <X className="h-4 w-4" /> Verwerfen
            </Button>
            <Button onClick={accept} className="gap-1.5">
              <Check className="h-4 w-4" /> Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
