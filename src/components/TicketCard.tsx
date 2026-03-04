import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { PRIORITY_LABELS, PRIORITY_COLORS, STATUS_LABELS, STATUS_COLORS } from '@/lib/ticket-types';

interface Props {
  ticket: {
    id: string;
    ticket_key: string;
    title: string;
    priority: string;
    status: string;
    assigned_to: string | null;
    due_date: string | null;
    assignee_name?: string;
  };
  isDragging?: boolean;
}

export function TicketCard({ ticket, isDragging }: Props) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className={cn(
        'block rounded-md border border-border bg-card p-3 space-y-2 transition-all hover:border-primary/30 hover:shadow-sm',
        isDragging && 'opacity-60 shadow-lg ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">{ticket.ticket_key}</span>
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-1', STATUS_COLORS[ticket.status])} title={STATUS_LABELS[ticket.status]} />
      </div>
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{ticket.title}</p>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className={cn('font-medium', PRIORITY_COLORS[ticket.priority])}>
          {PRIORITY_LABELS[ticket.priority]}
        </span>
        {ticket.due_date && (
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(ticket.due_date), 'dd.MM.')}
          </span>
        )}
        {ticket.assignee_name && (
          <span className="flex items-center gap-0.5 ml-auto">
            <User className="h-2.5 w-2.5" />
            {ticket.assignee_name}
          </span>
        )}
      </div>
    </Link>
  );
}
