import type { Enums } from '@/integrations/supabase/types';
import { STATUS_LABELS, STATUS_VARIANTS } from '@/lib/case-utils';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: Enums<'case_status'>;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-primary-foreground whitespace-nowrap',
      STATUS_VARIANTS[status],
      className,
    )}>
      {STATUS_LABELS[status]}
    </span>
  );
}
