import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState<K extends string = string> {
  column: K | null;
  direction: SortDirection;
}

export function nextSort<K extends string>(prev: SortState<K>, column: K): SortState<K> {
  if (prev.column !== column) return { column, direction: 'asc' };
  if (prev.direction === 'asc') return { column, direction: 'desc' };
  if (prev.direction === 'desc') return { column: null, direction: null };
  return { column, direction: 'asc' };
}

/** Sort an array by an accessor. Null/undefined always sort to the end. */
export function sortBy<T>(
  arr: T[],
  accessor: (item: T) => string | number | null | undefined,
  direction: SortDirection,
): T[] {
  if (!direction) return arr;
  const copy = [...arr];
  copy.sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    const aNull = av === null || av === undefined || av === '';
    const bNull = bv === null || bv === undefined || bv === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return direction === 'asc' ? av - bv : bv - av;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as < bs) return direction === 'asc' ? -1 : 1;
    if (as > bs) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return copy;
}

interface Props<K extends string> {
  column: K;
  sort: SortState<K>;
  onSort: (col: K) => void;
  className?: string;
  children: React.ReactNode;
}

export function SortableHeader<K extends string>({ column, sort, onSort, className, children }: Props<K>) {
  const active = sort.column === column;
  const Icon = active
    ? sort.direction === 'asc'
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 select-none hover:text-foreground transition-colors',
          active && 'text-foreground',
        )}
      >
        {children}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}
