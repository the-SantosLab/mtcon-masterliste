import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, X, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Profile { id: string; display_name: string; short_code: string; }

interface WatchersSectionProps {
  caseId: string;
  watchers: string[];
  profiles: Profile[];
  canEdit: boolean;
  onChange: () => void;
}

export function WatchersSection({ caseId, watchers, profiles, canEdit, onChange }: WatchersSectionProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const watched = useMemo(
    () => watchers.map(id => profiles.find(p => p.id === id)).filter(Boolean) as Profile[],
    [watchers, profiles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(p =>
      p.display_name.toLowerCase().includes(q) || p.short_code.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  const update = async (next: string[]) => {
    setSaving(true);
    const { error } = await supabase.from('cases').update({ watchers: next } as any).eq('id', caseId);
    setSaving(false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    onChange();
  };

  const toggle = (id: string) => {
    const next = watchers.includes(id) ? watchers.filter(x => x !== id) : [...watchers, id];
    update(next);
  };

  return (
    <div className="rounded-md border border-border bg-card px-5 py-2">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Weitere Personen informieren</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">Diese Personen erhalten eine Email, wenn Aufgaben abgeschlossen werden.</p>

      <div className="flex flex-wrap items-center gap-2">
        {watched.length === 0 && <span className="text-[13px] text-muted-foreground">Niemand</span>}
        {watched.map(p => (
          <Badge key={p.id} variant="secondary" className="text-[11px] gap-1.5 pr-1">
            <span className="font-mono text-[10px] text-muted-foreground">{p.short_code}</span>
            {p.display_name}
            {canEdit && (
              <button onClick={() => toggle(p.id)} className="ml-0.5 rounded hover:bg-muted p-0.5" disabled={saving}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px]">+ Hinzufügen</Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Suchen…"
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>
              <div className="max-h-[260px] overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-2">Keine Treffer</p>
                ) : filtered.map(p => {
                  const active = watchers.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      disabled={saving}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors',
                        active && 'bg-muted/30',
                      )}
                    >
                      <span className={cn('h-3 w-3 rounded border border-border flex items-center justify-center text-[9px]', active && 'bg-primary border-primary text-primary-foreground')}>
                        {active ? '✓' : ''}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.short_code}</span>
                      <span className="flex-1 truncate">{p.display_name}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
