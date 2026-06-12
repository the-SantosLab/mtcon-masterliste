import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ArticleOption {
  art_nr: string;
  matchcode: string | null;
  bezeich_1: string | null;
  me: string | null;
  standardpreis?: number | null;
  eisos_nr?: string | null;
  erni_nr?: string | null;
  ics_nr?: string | null;
  weber_art_nr?: string | null;
}

interface Props {
  value?: string | null;
  onChange: (article: ArticleOption | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ArticlePicker({ value, onChange, placeholder = 'Artikel wählen…', className, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ArticleOption[]>([]);
  const [selected, setSelected] = useState<ArticleOption | null>(null);
  const [loading, setLoading] = useState(false);

  // Resolve selected display info
  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.art_nr === value) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('articles')
        .select('art_nr,matchcode,bezeich_1,me')
        .eq('art_nr', value)
        .maybeSingle();
      if (data) setSelected(data);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Search
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = (supabase as any)
        .from('articles')
        .select('art_nr,matchcode,bezeich_1,bezeich_2,me,eisos_nr,erni_nr,ics_nr,weber_art_nr,article_prices(standardpreis)')
        .eq('is_blocked', false)
        .limit(30);
      if (q.trim()) {
        const term = q.trim().replace(/[,()]/g, ' ');
        const esc = term.replace(/%/g, '');
        query = query.or(
          [
            `art_nr.ilike.%${esc}%`,
            `matchcode.ilike.%${esc}%`,
            `bezeich_1.ilike.%${esc}%`,
            `bezeich_2.ilike.%${esc}%`,
            `eisos_nr.ilike.%${esc}%`,
            `erni_nr.ilike.%${esc}%`,
            `ics_nr.ilike.%${esc}%`,
            `weber_art_nr.ilike.%${esc}%`,
          ].join(',')
        );
      } else {
        query = query.order('art_nr', { ascending: true });
      }
      const { data } = await query;
      if (cancel) return;
      const flat: ArticleOption[] = (data ?? []).map((r: any) => ({
        art_nr: r.art_nr,
        matchcode: r.matchcode,
        bezeich_1: r.bezeich_1,
        me: r.me,
        eisos_nr: r.eisos_nr,
        erni_nr: r.erni_nr,
        ics_nr: r.ics_nr,
        weber_art_nr: r.weber_art_nr,
        standardpreis: r.article_prices?.standardpreis ?? null,
      }));
      setItems(flat);
      setLoading(false);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  const label = selected
    ? `${selected.art_nr} · ${selected.matchcode ?? ''} ${selected.bezeich_1 ? '— ' + selected.bezeich_1 : ''}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('h-9 w-full justify-start text-xs font-normal', className)}
        >
          <Package className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[480px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Suche Art.-Nr, Matchcode, Bezeichnung…"
            className="text-xs"
          />
          <CommandList>
            {loading && <div className="px-3 py-4 text-xs text-muted-foreground">Lade…</div>}
            {!loading && items.length === 0 && <CommandEmpty>Keine Artikel gefunden</CommandEmpty>}
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear"
                  onSelect={() => { onChange(null); setSelected(null); setOpen(false); }}
                  className="text-xs text-muted-foreground"
                >
                  Auswahl entfernen
                </CommandItem>
              )}
              {items.map((it) => (
                <CommandItem
                  key={it.art_nr}
                  value={it.art_nr}
                  onSelect={() => { setSelected(it); onChange(it); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn('h-3 w-3 mr-2', value === it.art_nr ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{it.art_nr}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {it.matchcode} {it.bezeich_1 ? `· ${it.bezeich_1}` : ''}
                    </div>
                  </div>
                  {it.me && <Badge variant="secondary" className="text-[10px] ml-2">{it.me}</Badge>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
