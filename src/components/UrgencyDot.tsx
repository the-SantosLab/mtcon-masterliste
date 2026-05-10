import { cn } from '@/lib/utils';
import { getUrgencyDotColor, getUrgencyDotLabel } from '@/lib/case-utils';
import type { Enums } from '@/integrations/supabase/types';

type CaseStatus = Enums<'case_status'>;

interface Props {
  status: CaseStatus;
  dueAt: string | null;
  /** Force-render even when terminal (no urgency). */
  forceLabel?: string;
  forceColor?: string;
  className?: string;
}

/**
 * 16px urgency dot with a centered white glyph for color-blind safety.
 * TODO(Mario): Confirm whether to use numbers 1–5 or letters A–E instead of symbols.
 */
export function UrgencyDot({ status, dueAt, forceLabel, forceColor, className }: Props) {
  const color = forceColor ?? getUrgencyDotColor(status, dueAt);
  const label = forceLabel ?? getUrgencyDotLabel(status, dueAt);
  if (color === 'bg-transparent') {
    return <span className={cn('h-4 w-4 shrink-0 inline-block', className)} aria-hidden />;
  }
  return (
    <span
      className={cn(
        'h-4 w-4 rounded-full shrink-0 inline-flex items-center justify-center text-white font-bold leading-none select-none',
        color,
        className,
      )}
      style={{ fontSize: '9px' }}
      aria-label={label || undefined}
    >
      {label}
    </span>
  );
}
