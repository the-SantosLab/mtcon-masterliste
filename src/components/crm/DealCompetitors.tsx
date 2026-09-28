import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Swords } from 'lucide-react';
import { toast } from 'sonner';

export function DealCompetitors({ dealId }: { dealId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [all, setAll] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('deal_competitors').select('*, competitors(name)').eq('deal_id', dealId).order('created_at'),
      supabase.from('competitors').select('id, name').order('name'),
    ]);
    setRows(r ?? []); setAll(c ?? []);
  };
  useEffect(() => { void load(); }, [dealId]);

  const add = async () => {
    const n = name.trim();
    if (!n) return toast.error('Mitbewerber angeben');
    let comp = all.find(c => c.name.toLowerCase() === n.toLowerCase());
    if (!comp) {
      const { data, error } = await supabase.from('competitors').insert({ name: n }).select('id, name').single();
      if (error) return toast.error(error.message);
      comp = data!;
    }
    const { error } = await supabase.from('deal_competitors').insert({ deal_id: dealId, competitor_id: comp.id, their_price: price ? Number(price) : null, strengths: note || null });
    if (error) return toast.error(error.code === '23505' ? 'Bereits erfasst' : error.message);
    setName(''); setPrice(''); setNote(''); void load();
  };
  const del = async (id: string) => { await supabase.from('deal_competitors').delete().eq('id', id); void load(); };

  return (
    <div className="glass-card rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Swords className="h-4 w-4" />Mitbewerber</h3>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Keine Mitbewerber erfasst.</p>}
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs border-t border-border/40 pt-1.5">
          <div><span className="font-medium">{r.competitors?.name}</span>{r.their_price != null && <span className="text-muted-foreground"> · Preis {Number(r.their_price).toLocaleString('de-DE')} €</span>}{r.strengths && <span className="text-muted-foreground"> · {r.strengths}</span>}</div>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => del(r.id)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Input list="competitor-list" placeholder="Mitbewerber" value={name} onChange={e => setName(e.target.value)} className="h-8 text-xs" />
        <datalist id="competitor-list">{all.map(c => <option key={c.id} value={c.name} />)}</datalist>
        <Input type="number" placeholder="Preis (optional)" value={price} onChange={e => setPrice(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Notiz / Stärken" value={note} onChange={e => setNote(e.target.value)} className="h-8 text-xs" />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={add}><Plus className="h-3 w-3" />Hinzufügen</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Mitbewerber werden zentral gespeichert und stehen bei allen Deals zur Auswahl.</p>
    </div>
  );
}
