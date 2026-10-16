import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Check, AlertCircle } from 'lucide-react';

type Art = { art_nr: string; bezeich_1: string | null };

/** Freitext-Artikelnummer mit Vorschlägen und Abgleich gegen den Artikelstamm. */
export function ArticleNoInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hits, setHits] = useState<Art[]>([]);
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState<Art | null | undefined>(undefined);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setHits([]); setMatch(undefined); return; }
    const t = setTimeout(async () => {
      const esc = q.replace(/[%_,()]/g, '');
      const { data } = await supabase.from('articles')
        .select('art_nr,bezeich_1')
        .or(`art_nr.ilike.%${esc}%,bezeich_1.ilike.%${esc}%`)
        .order('art_nr').limit(10);
      const list = (data as Art[]) ?? [];
      setHits(list);
      const exact = list.find(a => a.art_nr.toLowerCase() === q.toLowerCase());
      if (exact) setMatch(exact);
      else {
        const { data: e } = await supabase.from('articles').select('art_nr,bezeich_1').ilike('art_nr', esc).maybeSingle();
        setMatch((e as Art) ?? null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative">
      <Input value={value} placeholder="Artikelnummer oder Bezeichnung"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-8 text-xs font-mono" />
      {open && hits.length > 0 && !(match && hits.length === 1) && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {hits.map(a => (
            <button key={a.art_nr} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(a.art_nr); setOpen(false); }}
              className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent">
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">{a.art_nr}</span>
              <span className="truncate">{a.bezeich_1}</span>
            </button>
          ))}
        </div>
      )}
      {value.trim().length >= 2 && match !== undefined && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          {match ? <><Check className="h-3 w-3 text-primary" />{match.bezeich_1 || 'Artikel gefunden'}</>
            : <><AlertCircle className="h-3 w-3" />Nicht im Artikelstamm – wird als Freitext übernommen</>}
        </div>
      )}
    </div>
  );
}
