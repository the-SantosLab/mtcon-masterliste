import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Summary = {
  supplier_id: string;
  supplier_name: string;
  rating_count: number;
  avg_quality: number | null;
  avg_delivery: number | null;
  avg_price: number | null;
  avg_communication: number | null;
  avg_overall: number | null;
};

type Rating = {
  id: string;
  supplier_id: string;
  rated_by: string;
  case_id: string | null;
  quality: number;
  delivery: number;
  price: number;
  communication: number;
  comment: string | null;
  created_at: string;
};

const StarRow = ({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        disabled={readOnly}
        onClick={() => onChange?.(n)}
        className={readOnly ? 'cursor-default' : 'cursor-pointer'}
      >
        <Star className={`h-4 w-4 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
      </button>
    ))}
  </div>
);

const fmt = (v: number | null) => (v == null ? '–' : v.toFixed(2));

export default function AdminSupplierRatings() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', quality: 5, delivery: 5, price: 5, communication: 5, comment: '' });

  const load = async () => {
    const [{ data: s }, { data: r }, { data: sup }] = await Promise.all([
      (supabase as any).from('supplier_rating_summary').select('*').order('supplier_name'),
      (supabase as any).from('supplier_ratings').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
    ]);
    setSummary((s ?? []) as Summary[]);
    setRatings((r ?? []) as Rating[]);
    setSuppliers((sup ?? []) as any);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => summary.filter((x) => x.supplier_name?.toLowerCase().includes(q.toLowerCase())),
    [summary, q]
  );

  const supplierRatings = useMemo(
    () => (selected ? ratings.filter((r) => r.supplier_id === selected) : []),
    [ratings, selected]
  );

  const submit = async () => {
    if (!form.supplier_id || !user) return;
    const { error } = await (supabase as any).from('supplier_ratings').insert({
      supplier_id: form.supplier_id,
      rated_by: user.id,
      quality: form.quality,
      delivery: form.delivery,
      price: form.price,
      communication: form.communication,
      comment: form.comment || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Bewertung gespeichert');
    setDialogOpen(false);
    setForm({ supplier_id: '', quality: 5, delivery: 5, price: 5, communication: 5, comment: '' });
    load();
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lieferantenbewertung</h1>
            <p className="text-sm text-muted-foreground">Qualität, Liefertreue, Preis und Kommunikation pro Lieferant</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Neue Bewertung</Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">Übersicht</CardTitle>
              <Input className="max-w-xs" placeholder="Lieferant suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieferant</TableHead>
                  <TableHead className="text-right">Anzahl</TableHead>
                  <TableHead className="text-right">Qualität</TableHead>
                  <TableHead className="text-right">Liefertreue</TableHead>
                  <TableHead className="text-right">Preis</TableHead>
                  <TableHead className="text-right">Kommunikation</TableHead>
                  <TableHead className="text-right">Gesamt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.supplier_id}
                    className={`cursor-pointer ${selected === s.supplier_id ? 'bg-muted/40' : ''}`}
                    onClick={() => setSelected(s.supplier_id)}
                  >
                    <TableCell className="font-medium">{s.supplier_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.rating_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.avg_quality)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.avg_delivery)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.avg_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.avg_communication)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(s.avg_overall)}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Daten</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bewertungen — {summary.find(s => s.supplier_id === selected)?.supplier_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplierRatings.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Bewertungen.</p>}
              {supplierRatings.map((r) => (
                <div key={r.id} className="border border-border/60 rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleString('de-DE')}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><div className="text-xs text-muted-foreground">Qualität</div><StarRow value={r.quality} readOnly /></div>
                    <div><div className="text-xs text-muted-foreground">Liefertreue</div><StarRow value={r.delivery} readOnly /></div>
                    <div><div className="text-xs text-muted-foreground">Preis</div><StarRow value={r.price} readOnly /></div>
                    <div><div className="text-xs text-muted-foreground">Kommunikation</div><StarRow value={r.communication} readOnly /></div>
                  </div>
                  {r.comment && <p className="text-sm text-foreground/90 whitespace-pre-wrap">{r.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Neue Lieferantenbewertung</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Lieferant</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">— wählen —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {(['quality', 'delivery', 'price', 'communication'] as const).map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <Label className="capitalize">
                    {k === 'quality' ? 'Qualität' : k === 'delivery' ? 'Liefertreue' : k === 'price' ? 'Preis' : 'Kommunikation'}
                  </Label>
                  <StarRow value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
                </div>
              ))}
              <div>
                <Label>Kommentar</Label>
                <Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={submit} disabled={!form.supplier_id}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
