import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SortableNavItem {
  href: string;
  label: string;
  icon: any;
  trailing?: React.ReactNode;
}

interface Props {
  storageKey: string;
  items: SortableNavItem[];
  linkClass: (href: string) => string;
  onItemClick?: () => void;
  /** extra classes appended to each link (e.g. indent/size) */
  itemClassName?: string;
}

function readOrder(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeOrder(key: string, order: string[]) {
  try { localStorage.setItem(key, JSON.stringify(order)); } catch { /* noop */ }
}

export function SortableNavList({ storageKey, items, linkClass, onItemClick, itemClassName }: Props) {
  const [order, setOrder] = useState<string[]>(() => readOrder(storageKey));
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragHref = useRef<string | null>(null);

  // Reset if the underlying item list changes shape
  useEffect(() => { setOrder(readOrder(storageKey)); }, [storageKey]);

  const ordered = useMemo(() => {
    const map = new Map(items.map(i => [i.href, i] as const));
    const result: SortableNavItem[] = [];
    for (const h of order) {
      const it = map.get(h);
      if (it) { result.push(it); map.delete(h); }
    }
    // append any new items (preserve original order for them)
    for (const i of items) if (map.has(i.href)) { result.push(i); map.delete(i.href); }
    return result;
  }, [items, order]);

  const reorder = (from: string, to: string) => {
    if (from === to) return;
    const list = ordered.map(i => i.href);
    const fromIdx = list.indexOf(from);
    const toIdx = list.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    list.splice(fromIdx, 1);
    list.splice(toIdx, 0, from);
    setOrder(list);
    writeOrder(storageKey, list);
  };

  return (
    <>
      {ordered.map(item => {
        const isOver = dragOver === item.href;
        return (
          <div
            key={item.href}
            onDragOver={(e) => { e.preventDefault(); if (dragHref.current && dragHref.current !== item.href) setDragOver(item.href); }}
            onDragLeave={() => { if (dragOver === item.href) setDragOver(null); }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragHref.current;
              setDragOver(null);
              dragHref.current = null;
              if (from) reorder(from, item.href);
            }}
            className={cn('group/sortable relative', isOver && 'before:absolute before:left-2 before:right-2 before:-top-px before:h-[2px] before:bg-primary before:rounded')}
          >
            <Link
              to={item.href}
              onClick={onItemClick}
              draggable
              onDragStart={(e) => {
                dragHref.current = item.href;
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', item.href); } catch { /* noop */ }
              }}
              onDragEnd={() => { dragHref.current = null; setDragOver(null); }}
              className={cn(linkClass(item.href), itemClassName, 'cursor-grab active:cursor-grabbing')}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.trailing}
              <GripVertical className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/sortable:opacity-100 transition-opacity shrink-0" />
            </Link>
          </div>
        );
      })}
    </>
  );
}
