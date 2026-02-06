import type { Enums } from '@/integrations/supabase/types';
import { STATUS_LABELS, STATUS_DOT_COLORS } from '@/lib/case-utils';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: Enums<'case_status'>;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium text-foreground whitespace-nowrap',
      className,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT_COLORS[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}
