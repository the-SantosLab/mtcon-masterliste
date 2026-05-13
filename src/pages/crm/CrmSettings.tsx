import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

const TIERS = ['standard', 'premium', 'distributor'] as const;
const TIER_LABEL: Record<string, string> = { standard: 'Standard', premium: 'Premium', distributor: 'Distributor' };

export default function CrmSettings() {
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: i }, { data: p }, { data: l }] = await Promise.all([
      supabase.from('price_list_items').select('*, products(code, name), price_lists(name)').order('created_at', { ascending: false }),
      supabase.from('products').select('id, code, name').order('name'),
      supabase.from('price_lists').select('id, name').order('name'),
    ]);
    setItems(i ?? []); setProducts(p ?? []); setLists(l ?? []);
    setLoading(false);
  };

  const ensureList = async () => {
    if (lists.length) return lists[0].id;
    const { data, error } = await supabase.from('price_lists').insert({ name: 'Standard', currency: 'EUR' }).select('id').single();
    if (error) { toast.error(error.message); return null; }
    setLists([{ id: data.id, name: 'Standard' }]);
    return data.id;
  };

  const addRow = async () => {
    const lid = await ensureList(); if (!lid) return;
    const { error } = await supabase.from('price_list_items').insert({
      price_list_id: lid, product_id: products[0]?.id ?? null, customer_tier: 'standard', price: 0, min_quantity: 1, is_active: true,
    });
    if (error) toast.error(error.message); else void load();
  };

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from('price_list_items').update(patch).eq('id', id);
    if (error) toast.error(error.message); else void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('price_list_items').delete().eq('id', id);
    if (error) toast.error(error.message); else void load();
  };

  const handleCsv = async (file: File) => {
    const text = await file.text();
    const sep = text.includes(';') ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error('Leere Datei'); return; }
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const lid = await ensureList(); if (!lid) return;
    const inserts: any[] = [];
    for (const line of lines.slice(1)) {
      const c = line.split(sep);
      const code = c[idx('artikel') >= 0 ? idx('artikel') : idx('code')]?.trim();
      const product = products.find(p => p.code === code);
      if (!product) continue;
      inserts.push({
        price_list_id: lid,
        product_id: product.id,
        customer_tier: (c[idx('tier')] || 'standard').trim() as any,
        price: Number(c[idx('preis') >= 0 ? idx('preis') : idx('price')]) || 0,
        min_quantity: Number(c[idx('mindestmenge')]) || 1,
        is_active: true,
      });
    }
    if (!inserts.length) { toast.error('Keine zuordenbaren Artikel'); return; }
    const { error } = await supabase.from('price_list_items').insert(inserts);
    if (error) toast.error(error.message); else { toast.success(`${inserts.length} importiert`); void load(); }
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Preislisten</h1>
        <div className="flex gap-2">
          <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs border border-border bg-card/60 hover:bg-card cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> CSV-Import
            <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleCsv(e.target.files[0])} />
          </label>
          <Button size="sm" onClick={addRow} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Zeile</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">CSV-Format: artikel;tier;preis;mindestmenge — Header in erster Zeile.</p>

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Artikel</th>
              <th className="px-3 py-2 font-medium">Kundenstufe</th>
              <th className="px-3 py-2 font-medium text-right">Preis</th>
              <th className="px-3 py-2 font-medium text-right">Min. Menge</th>
              <th className="px-3 py-2 font-medium">Gültig bis</th>
              <th className="px-3 py-2 font-medium">Aktiv</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-10 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>
            : items.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Keine Einträge.</td></tr>
            : items.map(it => (
              <tr key={it.id} className="border-t border-border/40">
                <td className="px-3 py-1.5">
                  <Select value={it.product_id ?? ''} onValueChange={v => update(it.id, { product_id: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5">
                  <Select value={it.customer_tier} onValueChange={v => update(it.id, { customer_tier: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIERS.map(t => <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5"><Input type="number" step="0.01" defaultValue={it.price} onBlur={e => update(it.id, { price: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
                <td className="px-3 py-1.5"><Input type="number" defaultValue={it.min_quantity} onBlur={e => update(it.id, { min_quantity: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
                <td className="px-3 py-1.5"><Input type="date" defaultValue={it.valid_to ?? ''} onBlur={e => update(it.id, { valid_to: e.target.value || null })} className="h-7 text-xs" /></td>
                <td className="px-3 py-1.5"><Switch checked={it.is_active} onCheckedChange={v => update(it.id, { is_active: v })} /></td>
                <td className="px-3 py-1.5"><button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CrmLayout>
  );
}
