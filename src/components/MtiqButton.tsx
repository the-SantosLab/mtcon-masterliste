import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
        onResult(data.text);
        toast.success('Mit MTIQ formuliert');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Fehler bei MTIQ');
    } finally {
      setLoading(false);
    }
  };

  return (
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
  );
}
