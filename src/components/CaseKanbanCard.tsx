import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { STATUS_DOT_COLORS, STATUS_LABELS } from '@/lib/case-utils';
import type { Enums } from '@/integrations/supabase/types';

interface Props {
  caseItem: {
    id: string;
    case_no: string;
    project_name: string;
    status: string;
    due_at: string | null;
    assignee_short_code?: string;
  };
  isDragging?: boolean;
}

export function CaseKanbanCard({ caseItem, isDragging }: Props) {
  return (
    <Link
      to={`/cases/${caseItem.id}`}
      className={cn(
        'block rounded-md border border-border bg-card p-3 space-y-2 transition-all hover:border-primary/30 hover:shadow-sm',
        isDragging && 'opacity-60 shadow-lg ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">{caseItem.case_no}</span>
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-1', STATUS_DOT_COLORS[caseItem.status as Enums<'case_status'>] || 'bg-muted-foreground')}
          title={STATUS_LABELS[caseItem.status as Enums<'case_status'>] || caseItem.status}
        />
      </div>
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{caseItem.project_name}</p>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {caseItem.due_at && (
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(caseItem.due_at), 'dd.MM.')}
          </span>
        )}
        {caseItem.assignee_short_code && (
          <span className="flex items-center gap-0.5 ml-auto">
            <User className="h-2.5 w-2.5" />
            {caseItem.assignee_short_code}
          </span>
        )}
      </div>
    </Link>
  );
}
