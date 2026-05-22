import { useEffect, useRef } from 'react';
import { UserAvatar } from '@/components/UserAvatar';

export interface MentionUser {
  id: string;
  display_name: string;
  short_code: string;
  avatar_url: string | null;
}

interface Props {
  query: string;
  users: MentionUser[];
  activeIndex: number;
  onPick: (u: MentionUser) => void;
  onHover: (i: number) => void;
}

export function MentionPopover({ query, users, activeIndex, onPick, onHover }: Props) {
  const q = query.toLowerCase();
  const filtered = users.filter(u =>
    !q || u.short_code.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)
  ).slice(0, 6);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-mi="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (filtered.length === 0) return null;
  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 left-2 w-64 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md z-20"
      onMouseDown={(e) => e.preventDefault()}
    >
      {filtered.map((u, i) => (
        <button
          key={u.id}
          data-mi={i}
          type="button"
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(u)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted ${i === activeIndex ? 'bg-muted' : ''}`}
        >
          <UserAvatar user={u} size="sm" />
          <span className="flex-1 min-w-0 truncate">{u.display_name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">@{u.short_code}</span>
        </button>
      ))}
    </div>
  );
}

export function getActiveMention(value: string, caretPos: number): { start: number; query: string } | null {
  // Look back from caret for an @ that starts a token
  const upto = value.slice(0, caretPos);
  const m = /(^|\s)@([A-Za-z0-9._-]{0,30})$/.exec(upto);
  if (!m) return null;
  const start = caretPos - m[2].length - 1;
  return { start, query: m[2] };
}
