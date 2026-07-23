import { useState } from 'react';
import { Sparkles, Loader2, Check, X, ChevronDown, Wand2, Feather } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { TextDiffView } from '@/components/TextDiffView';

type ReformulateMode = 'light' | 'full';

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
  const [usedMode, setUsedMode] = useState<ReformulateMode>('full');
  const trimmed = (text || '').trim();
  const isDisabled = disabled || loading || trimmed.length < minChars;

  const run = async (mode: ReformulateMode) => {
    if (isDisabled) return;
    setLoading(true);
    setUsedMode(mode);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-reformulate', {
        body: { text: trimmed, mode },
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary', className)}
            disabled={isDisabled}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {label}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => run('light')} className="flex items-start gap-2 py-2">
            <Feather className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Kleine Umformulierung</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Nur Rechtschreibung, Grammatik und sprachliche Glättung
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run('full')} className="flex items-start gap-2 py-2">
            <Wand2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Große Umformulierung</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Vollständige sprachliche Überarbeitung und Strukturierung
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              MTIQ-Vorschlag prüfen
              <span className="ml-2 text-[10px] font-normal text-muted-foreground uppercase tracking-wide">
                {usedMode === 'light' ? 'Kleine Umformulierung' : 'Große Umformulierung'}
              </span>
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
