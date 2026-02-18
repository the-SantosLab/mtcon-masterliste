import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Search, FolderKanban, ClipboardList, User2,
  ArrowRight, X, Loader2,
} from 'lucide-react';

interface Result {
  id: string;
  type: 'project' | 'case' | 'user';
  title: string;
  sub: string;
  href: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPE_ICON = {
  project: FolderKanban,
  case: ClipboardList,
  user: User2,
};

const TYPE_LABEL = {
  project: 'Projekt',
  case: 'Vorgang',
  user: 'Benutzer',
};

const TYPE_COLOR: Record<string, string> = {
  project: 'text-[hsl(var(--status-working))] bg-[hsl(var(--status-working))]/10',
  case: 'text-primary bg-primary/10',
  user: 'text-muted-foreground bg-muted',
};

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);

    const term = `%${q.trim()}%`;
    const [projRes, caseRes, userRes] = await Promise.all([
      supabase.from('projects')
        .select('id, project_number, name, status')
        .or(`name.ilike.${term},project_number.ilike.${term},project_code.ilike.${term}`)
        .limit(5),
      supabase.from('cases')
        .select('id, case_no, project_name, status')
        .or(`case_no.ilike.${term},project_name.ilike.${term},customer_no.ilike.${term}`)
        .limit(5),
      supabase.from('users_profile')
        .select('id, display_name, short_code')
        .or(`display_name.ilike.${term},short_code.ilike.${term}`)
        .eq('active', true)
        .limit(4),
    ]);

    const mapped: Result[] = [
      ...((projRes.data ?? []) as any[]).map(p => ({
        id: p.id,
        type: 'project' as const,
        title: p.name,
        sub: p.project_number,
        href: `/projects/${p.id}`,
      })),
      ...((caseRes.data ?? []) as any[]).map(c => ({
        id: c.id,
        type: 'case' as const,
        title: c.project_name,
        sub: c.case_no,
        href: `/cases/${c.id}`,
      })),
      ...((userRes.data ?? []) as any[]).map(u => ({
        id: u.id,
        type: 'user' as const,
        title: u.display_name,
        sub: u.short_code,
        href: `/admin/users`,
      })),
    ];

    setResults(mapped);
    setActive(0);
    setLoading(false);
  }, []);

  // Debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(a => Math.min(a + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => Math.max(a - 1, 0));
      }
      if (e.key === 'Enter' && results[active]) {
        navigate(results[active].href);
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, active, navigate, onClose]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (href: string) => { navigate(href); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
            : <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suche nach Projekten, Vorgängen, Benutzern…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {!query && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Tippe um zu suchen — Projekte, Vorgänge, Benutzer
            </div>
          )}
          {query && results.length === 0 && !loading && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Keine Ergebnisse für „{query}"
            </div>
          )}

          {results.length > 0 && (
            <div className="p-1.5">
              {(['project', 'case', 'user'] as const).map(type => {
                const group = results.filter(r => r.type === type);
                if (!group.length) return null;
                const Icon = TYPE_ICON[type];
                return (
                  <div key={type}>
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {TYPE_LABEL[type]}
                    </div>
                    {group.map(r => {
                      const idx = results.indexOf(r);
                      return (
                        <button
                          key={r.id}
                          data-idx={idx}
                          onClick={() => go(r.href)}
                          onMouseEnter={() => setActive(idx)}
                          className={cn(
                            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
                            active === idx ? 'bg-muted' : 'hover:bg-muted/60',
                          )}
                        >
                          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', TYPE_COLOR[type])}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{r.title}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{r.sub}</p>
                          </div>
                          <ArrowRight className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-opacity',
                            active === idx ? 'opacity-100 text-muted-foreground' : 'opacity-0',
                          )} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 py-0.5 font-mono">↑↓</kbd> Navigieren
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 py-0.5 font-mono">↵</kbd> Öffnen
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 py-0.5 font-mono">ESC</kbd> Schließen
          </span>
        </div>
      </div>
    </div>
  );
}
