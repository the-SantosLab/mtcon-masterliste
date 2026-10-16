import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { ProcurementHeader } from '@/components/erp/ProcurementHeader';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardCheck, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { countDelta, countProgress } from '@/lib/stockCount';

const db = supabase as any;
type Count = { id: string; count_no: string; warehouse_id: string; status: string; note: string | null; created_at: string; posted_at: string | null; warehouses?: { code: string; name: string } };
type Item = { id: string; art_nr: string; expected_qty: number; counted_qty: number | null; posted_delta: number | null; note: string | null; articles?: { bezeich_1: string | null; me: string | null } };
const STATUS: Record<string, string> = { counting: 'Zählung läuft', posted: 'Gebucht', cancelled: 'Abgebrochen' };
const fmt = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });

export default function StockCounts() {
  const { isAdmin } = useAuth();
  const [counts, setCounts] = useState<Count[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Count | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'diff'>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newWh, setNewWh] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addArt, setAddArt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, w] = await Promise.all([
      db.from('stock_counts').select('*, warehouses(code,name)').order('created_at', { ascending: false }),
      db.from('warehouses').select('id,code,name').order('code'),
    ]);
    setCounts(c.data ?? []); setWarehouses(w.data ?? []); setLoading(false);
  }, []);
  const loadItems = useCallback(async (id: string) => {
    const { data } = await db.from('stock_count_items').select('*, articles(bezeich_1, me)').eq('count_id', id).order('art_nr');
    setItems(data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (sel) void loadItems(sel.id); }, [sel, loadItems]);

  const create = async () => {
    if (!newWh) return;
    setBusy(true);
    const { data, error } = await db.rpc('create_stock_count', { _warehouse_id: newWh, _note: newNote || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Inventur gestartet');
    setCreateOpen(false); setNewNote('');
    await load();
    const { data: c } = await db.from('stock_counts').select('*, warehouses(code,name)').eq('id', data).single();
    if (c) setSel(c);
  };

  const saveCount = async (it: Item, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (v != null && (Number.isNaN(v) || v < 0)) return toast.error('Ungültige Menge');
    if (v === it.counted_qty) return;
    const { error } = await db.from('stock_count_items').update({ counted_qty: v }).eq('id', it.id);
    if (error) return toast.error(error.message);
    setItems(prev => prev.map(p => p.id === it.id ? { ...p, counted_qty: v } : p));
  };

  const addItem = async () => {
    if (!sel || !addArt.trim()) return;
    const { error } = await db.rpc('add_stock_count_item', { _count_id: sel.id, _art_nr: addArt.trim() });
    if (error) return toast.error(error.message.includes('foreign key') ? 'Artikelnummer nicht gefunden' : error.message);
    setAddArt(''); void loadItems(sel.id);
  };

  const post = async () => {
    if (!sel || !confirm('Inventur jetzt buchen? Alle Differenzen werden als Lagerkorrektur gebucht.')) return;
    setBusy(true);
    const { data, error } = await db.rpc('post_stock_count', { _count_id: sel.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Inventur gebucht, ${data} Korrekturbuchung(en)`);
    setSel({ ...sel, status: 'posted' }); void load(); void loadItems(sel.id);
  };
  const cancel = async () => {
    if (!sel || !confirm('Inventur abbrechen? Es wird nichts gebucht.')) return;
    const { error } = await db.rpc('cancel_stock_count', { _count_id: sel.id });
    if (error) return toast.error(error.message);
    setSel({ ...sel, status: 'cancelled' }); void load();
  };

  const progress = useMemo(() => countProgress(items), [items]);
  const shown = useMemo(() => items.filter(it => {
    if (filter === 'open' && it.counted_qty != null) return false;
    if (filter === 'diff') { const d = countDelta(it); if (!d) return false; }
    const q = search.toLowerCase();
    return !q || it.art_nr.toLowerCase().includes(q) || (it.articles?.bezeich_1 ?? '').toLowerCase().includes(q);
  }), [items, filter, search]);

  if (sel) {
    const editable = sel.status === 'counting';
    return <AppLayout><div className="fulfillment-page procurement-page">
      <ProcurementHeader title={`Inventur ${sel.count_no}`} subtitle={`${sel.warehouses?.code ?? ''} ${sel.warehouses?.name ?? ''} · ${STATUS[sel.status]}`} actions={<>
        <Button size="sm" variant="outline" onClick={() => { setSel(null); setItems([]); }}><ArrowLeft className="h-4 w-4" />Alle Inventuren</Button>
        {editable && isAdmin && <Button size="sm" variant="outline" onClick={cancel}><XCircle className="h-4 w-4" />Abbrechen</Button>}
        {editable && isAdmin && <Button size="sm" disabled={!progress.complete || busy} onClick={post}><CheckCircle2 className="h-4 w-4" />Buchen</Button>}
      </>} />
      <FulfillmentMetrics metrics={[
        { label: 'Positionen', value: progress.total, onClick: () => setFilter('all'), active: filter === 'all' },
        { label: 'Gezählt', value: `${progress.counted} / ${progress.total}`, tone: progress.complete ? 'done' : 'working' },
        { label: 'Noch offen', value: progress.open, tone: progress.open ? 'working' : 'done', onClick: () => setFilter('open'), active: filter === 'open' },
        { label: 'Mit Differenz', value: progress.deviations, tone: progress.deviations ? 'overdue' : 'done', onClick: () => setFilter('diff'), active: filter === 'diff' },
      ]} />
      {editable && !isAdmin && <p className="text-xs text-muted-foreground">Zählen kannst du selbst. Gebucht wird die Inventur von einem Admin.</p>}
      {editable && isAdmin && !progress.complete && <p className="text-xs text-muted-foreground">Buchen ist möglich, sobald alle Positionen gezählt sind.</p>}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Artikel suchen…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 max-w-xs text-xs" />
        {editable && <div className="flex gap-2">
          <Input placeholder="Artikelnummer ergänzen" value={addArt} onChange={e => setAddArt(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} className="h-8 w-48 text-xs" />
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4" />Hinzufügen</Button>
        </div>}
      </div>
      <Card className="procurement-table overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground"><tr>
            <th className="p-3 text-left font-medium">Artikel</th>
            <th className="p-3 text-left font-medium">Bezeichnung</th>
            <th className="p-3 text-right font-medium">Soll</th>
            <th className="p-3 text-right font-medium">Gezählt</th>
            <th className="p-3 text-right font-medium">Differenz</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Keine Positionen</td></tr>}
            {shown.map(it => {
              const d = sel.status === 'posted' ? it.posted_delta : countDelta(it);
              return <tr key={it.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{it.art_nr}</td>
                <td className="p-3 text-xs text-muted-foreground">{it.articles?.bezeich_1 ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{fmt(it.expected_qty)} <span className="text-[11px] text-muted-foreground">{it.articles?.me ?? ''}</span></td>
                <td className="p-3 text-right">{editable
                  ? <Input key={`${it.id}-${it.counted_qty}`} inputMode="decimal" defaultValue={it.counted_qty ?? ''} onBlur={e => saveCount(it, e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="ml-auto h-8 w-28 text-right tabular-nums" aria-label={`Zählmenge ${it.art_nr}`} />
                  : <span className="tabular-nums">{fmt(it.counted_qty)}</span>}</td>
                <td className={`p-3 text-right tabular-nums ${d ? (d < 0 ? 'text-status-overdue' : 'text-status-working') : 'text-muted-foreground'}`}>{d == null ? '—' : d > 0 ? `+${fmt(d)}` : fmt(d)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    </div></AppLayout>;
  }

  const running = counts.filter(c => c.status === 'counting').length;
  return <AppLayout><div className="fulfillment-page procurement-page">
    <ProcurementHeader title="Inventur" subtitle="Bestand zählen · Differenzen prüfen · Korrektur buchen" actions={
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Inventur starten</Button>} />
    <FulfillmentMetrics loading={loading} metrics={[
      { label: 'Inventuren', value: counts.length },
      { label: 'Zählung läuft', value: running, tone: running ? 'working' : 'done' },
      { label: 'Gebucht', value: counts.filter(c => c.status === 'posted').length, tone: 'done' },
      { label: 'Letzte Buchung', value: counts.find(c => c.posted_at)?.posted_at ? new Date(counts.find(c => c.posted_at)!.posted_at!).toLocaleDateString('de-DE') : '—' },
    ]} />
    <Card className="procurement-table overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground"><tr>
          <th className="p-3 text-left font-medium">Nr.</th><th className="p-3 text-left font-medium">Lager</th>
          <th className="p-3 text-left font-medium">Status</th><th className="p-3 text-left font-medium">Gestartet</th><th className="p-3 text-left font-medium">Notiz</th>
        </tr></thead>
        <tbody>
          {!loading && counts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-2 h-6 w-6" />Noch keine Inventur. Starte eine für ein Lager, um den Bestand zu zählen.</td></tr>}
          {counts.map(c => <tr key={c.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setSel(c)}>
            <td className="p-3 font-mono text-xs">{c.count_no}</td>
            <td className="p-3">{c.warehouses?.code} {c.warehouses?.name}</td>
            <td className="p-3"><Badge variant={c.status === 'posted' ? 'secondary' : c.status === 'cancelled' ? 'destructive' : 'default'}>{STATUS[c.status]}</Badge></td>
            <td className="p-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('de-DE')}</td>
            <td className="p-3 text-xs text-muted-foreground">{c.note ?? ''}</td>
          </tr>)}
        </tbody>
      </table>
    </Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inventur starten</DialogTitle>
          <DialogDescription>Alle Artikel mit Bestand in diesem Lager kommen auf die Zählliste. Weitere Artikel kannst du danach ergänzen.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label>Lager</Label>
            <Select value={newWh} onValueChange={setNewWh}><SelectTrigger><SelectValue placeholder="Lager wählen" /></SelectTrigger>
              <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} {w.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Notiz</Label><Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="z. B. Jahresinventur 2026" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
          <Button disabled={!newWh || busy} onClick={create}>Starten</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div></AppLayout>;
}
