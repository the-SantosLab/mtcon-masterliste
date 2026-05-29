import { cn } from '@/lib/utils';

interface Props {
  count: number;
  size?: 'sm' | 'xs';
  className?: string;
}

/**
 * Kleines, einheitliches Badge für ungelesene Chat-Nachrichten pro Vorgang.
 * Wird in Liste, Dashboard-Kacheln und Kanban-Karten verwendet.
 */
export function UnreadBadge({ count, size = 'sm', className }: Props) {
  if (!count || count <= 0) return null;
  return (
    <span
      title={`${count} ungelesene Nachricht(en)`}
      aria-label={`${count} ungelesene Nachrichten`}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold leading-none shrink-0',
        size === 'xs'
          ? 'min-w-[12px] h-[12px] px-0.5 text-[8px]'
          : 'min-w-[16px] h-[16px] px-1 text-[9px]',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
