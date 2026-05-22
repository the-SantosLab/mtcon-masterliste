import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  value: number | null | undefined;
  /** Set to enable inline persistence. If omitted, component is purely controlled and onChange is called. */
  table?: 'cases' | 'projects' | 'case_tasks';
  rowId?: string;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /** Hide the empty trailing chilis (only show filled). */
  compact?: boolean;
}

const LABELS = ['Keine Dringlichkeit', 'Sehr niedrig', 'Niedrig', 'Mittel', 'Hoch', 'Sehr dringend'];

const SIZE = {
  xs: 'h-3 w-3 text-[10px]',
  sm: 'h-3.5 w-3.5 text-[11px]',
  md: 'h-4 w-4 text-xs',
};

// Chili emoji rendered as inline character — color via filter (saturate for filled, grayscale for empty)
export function UrgencyPicker({ value, table, rowId, onChange, readOnly, size = 'sm', className, compact }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState<number>(value ?? 0);

  useEffect(() => { setLocalValue(value ?? 0); }, [value]);

  // Realtime: live-update when somebody else changes urgency on this row
  useEffect(() => {
    if (!table || !rowId) return;
    const channel = supabase
      .channel(`urgency-${table}-${rowId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${rowId}` },
        (payload) => {
          const next = (payload.new as any)?.urgency;
          if (typeof next === 'number') setLocalValue(next);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, rowId]);

  const current = localValue;
  const display = hover ?? current;

  const set = async (v: number) => {
    if (readOnly || saving) return;
    const next = current === v ? 0 : v; // click same again -> clear
    const prev = current;
    setLocalValue(next);
    onChange?.(next);
    if (table && rowId) {
      setSaving(true);
      const { error } = await (supabase as any).from(table).update({ urgency: next }).eq('id', rowId);
      setSaving(false);
      if (error) {
        setLocalValue(prev);
        toast.error('Dringlichkeit speichern fehlgeschlagen');
      }
    }
  };

  const max = compact ? Math.max(1, current) : 5;

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 select-none', className)}
      onMouseLeave={() => setHover(null)}
      role="radiogroup"
      aria-label={`Dringlichkeit: ${LABELS[current]}`}
      title={LABELS[display]}
    >
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const active = n <= display;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly || saving}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); void set(n); }}
            className={cn(
              'leading-none transition-all',
              SIZE[size],
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
              active
                ? 'opacity-100'
                : 'opacity-25 grayscale',
            )}
            style={{ filter: active ? 'none' : 'grayscale(1)' }}
            aria-label={`${n} – ${LABELS[n]}`}
          >
            🌶️
          </button>
        );
      })}
    </div>
  );
}

export default UrgencyPicker;
