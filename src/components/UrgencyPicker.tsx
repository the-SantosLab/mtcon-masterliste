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
  /** True wenn der Wert aus untergeordneten Ebenen abgeleitet wird (Unteraufgaben → Vorgang, Vorgänge → Projekt). */
  derived?: boolean;
  /** True wenn der derzeit gespeicherte Wert ein Admin-Override ist. */
  overridden?: boolean;
  /** True wenn der aktuelle Benutzer Admin ist (darf Ableitung manuell überschreiben). */
  canOverride?: boolean;
}

const LABELS = ['Keine Dringlichkeit', 'Sehr niedrig', 'Niedrig', 'Mittel', 'Hoch', 'Sehr dringend'];

const SIZE = {
  xs: 'h-3 w-3 text-[10px]',
  sm: 'h-3.5 w-3.5 text-[11px]',
  md: 'h-4 w-4 text-xs',
};

export function UrgencyPicker({
  value, table, rowId, onChange, readOnly, size = 'sm', className, compact,
  derived, overridden, canOverride,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState<number>(value ?? 0);
  const [localOverridden, setLocalOverridden] = useState<boolean>(!!overridden);

  useEffect(() => { setLocalValue(value ?? 0); }, [value]);
  useEffect(() => { setLocalOverridden(!!overridden); }, [overridden]);

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
          const ovr = (payload.new as any)?.urgency_override;
          if (typeof ovr === 'boolean') setLocalOverridden(ovr);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, rowId]);

  const current = localValue;
  const display = hover ?? current;

  // Effektive Read-Only-Logik:
  // - explicit readOnly → readOnly
  // - derived && !canOverride → readOnly
  const effectiveReadOnly = !!readOnly || (!!derived && !canOverride);

  const set = async (v: number) => {
    if (effectiveReadOnly || saving) return;
    const next = current === v ? 0 : v;
    const prev = current;
    setLocalValue(next);
    onChange?.(next);
    if (table && rowId) {
      setSaving(true);
      const { error } = await (supabase as any).from(table).update({ urgency: next }).eq('id', rowId);
      setSaving(false);
      if (error) {
        setLocalValue(prev);
        toast.error(error.message?.includes('abgeleitet')
          ? 'Dringlichkeit wird abgeleitet – nur Admins können sie manuell setzen.'
          : 'Dringlichkeit speichern fehlgeschlagen');
      }
    }
  };

  const clearOverride = async () => {
    if (!table || !rowId || !canOverride || saving) return;
    setSaving(true);
    const { error } = await (supabase as any).from(table).update({
      urgency_override: false,
      urgency_override_by: null,
      urgency_override_at: null,
    }).eq('id', rowId);
    setSaving(false);
    if (error) { toast.error('Override konnte nicht zurückgesetzt werden'); return; }
    setLocalOverridden(false);
    toast.success('Override aufgehoben – Dringlichkeit wird wieder abgeleitet');
  };

  const max = compact ? Math.max(1, current) : 5;

  const tooltipParts: string[] = [LABELS[display]];
  if (derived && !localOverridden) tooltipParts.push('(abgeleitet)');
  if (localOverridden) tooltipParts.push('(manuell, Admin)');

  return (
    <div className={cn('inline-flex items-center gap-1 select-none', className)} onMouseLeave={() => setHover(null)}>
      <div
        className="inline-flex items-center gap-0.5"
        role="radiogroup"
        aria-label={`Dringlichkeit: ${LABELS[current]}`}
        title={tooltipParts.join(' ')}
      >
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const active = n <= display;
          return (
            <button
              key={n}
              type="button"
              disabled={effectiveReadOnly || saving}
              onMouseEnter={() => !effectiveReadOnly && setHover(n)}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); void set(n); }}
              className={cn(
                'leading-none transition-all',
                SIZE[size],
                effectiveReadOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
                active ? 'opacity-100' : 'opacity-25 grayscale',
              )}
              style={{ filter: active ? 'none' : 'grayscale(1)' }}
              aria-label={`${n} – ${LABELS[n]}`}
            >
              🌶️
            </button>
          );
        })}
      </div>
      {derived && !localOverridden && (
        <span
          className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground/70 px-1 rounded bg-muted/40"
          title="Wird aus untergeordneten Ebenen berechnet"
        >Auto</span>
      )}
      {localOverridden && (
        <span
          className={cn(
            'text-[8px] font-medium uppercase tracking-wide px-1 rounded bg-amber-500/15 text-amber-400',
            canOverride && 'cursor-pointer hover:bg-amber-500/25',
          )}
          title={canOverride ? 'Manuell von Admin gesetzt – klicken um Override zu entfernen' : 'Manuell von Admin gesetzt'}
          onClick={(e) => { if (canOverride) { e.stopPropagation(); e.preventDefault(); void clearOverride(); } }}
        >Manuell</span>
      )}
    </div>
  );
}

export default UrgencyPicker;
