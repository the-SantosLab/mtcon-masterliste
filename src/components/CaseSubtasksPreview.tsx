import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Check, User as UserIcon } from 'lucide-react';

interface SubtaskRow {
  id: string;
  title: string;
  completed: boolean;
  status: string | null;
  sort_order: number | null;
  assignee: { short_code: string | null; display_name: string | null } | null;
}

interface Props {
  caseId: string;
  variant?: 'list' | 'card';
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
  cancelled: 'Storniert',
};

const STATUS_DOT: Record<string, string> = {
  open: 'bg-muted-foreground/40',
  in_progress: 'bg-blue-500',
  blocked: 'bg-red-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-muted-foreground/30',
};

export function CaseSubtasksPreview({ caseId, variant = 'list', className }: Props) {
  const [rows, setRows] = useState<SubtaskRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('case_tasks')
      .select('id, title, completed, status, sort_order, assignee:users_profile!case_tasks_assigned_to_fkey(short_code, display_name)')
      .eq('case_id', caseId)
      .is('archived_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as unknown as SubtaskRow[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) {
    return <div className={cn('text-[10px] text-muted-foreground italic px-2 py-1', className)}>Unteraufgaben laden…</div>;
  }
  if (!rows || rows.length === 0) {
    return <div className={cn('text-[10px] text-muted-foreground italic px-2 py-1', className)}>Keine Unteraufgaben.</div>;
  }

  const isCard = variant === 'card';

  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {rows.map(t => {
        const effectiveStatus = t.completed ? 'done' : (t.status || 'open');
        const dotClass = STATUS_DOT[effectiveStatus] ?? 'bg-muted-foreground/40';
        const statusLabel = STATUS_LABEL[effectiveStatus] ?? effectiveStatus;
        const assignee = t.assignee?.short_code || null;
        return (
          <li
            key={t.id}
            className={cn(
              'flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40 transition-colors',
              isCard ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotClass)}
              title={statusLabel}
              aria-label={statusLabel}
            />
            <span
              className={cn(
                'truncate flex-1',
                t.completed ? 'line-through text-muted-foreground' : 'text-foreground',
              )}
              title={t.title}
            >
              {t.title}
            </span>
            <span className={cn('text-[9px] uppercase tracking-wide text-muted-foreground shrink-0 hidden sm:inline', isCard && 'sm:hidden')}>
              {statusLabel}
            </span>
            {assignee ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground shrink-0" title={t.assignee?.display_name || undefined}>
                <UserIcon className="h-2.5 w-2.5" />
                {assignee}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/50 shrink-0">–</span>
            )}
            {t.completed && !isCard && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
          </li>
        );
      })}
    </ul>
  );
}
