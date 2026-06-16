import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Receipt, Plus, Trash2, Download } from "lucide-react";
import { generateInvoicePdf } from "@/lib/document-pdf";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IssosInvoicesTab } from "@/components/IssosInvoicesTab";

type Invoice = {
  id: string;
  invoice_no: string;
  order_id: string | null;
  delivery_id: string | null;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  invoice_date: string | null;
  due_date: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_no: string | null;
  billing_address: string | null;
  currency: string;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  paid_amount: number;
  paid_at: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
};
type InvItem = {
  id: string; invoice_id: string; position: number; art_nr: string | null;
  description: string; quantity: number; unit: string | null;
  unit_price: number | null; tax_rate: number | null; line_total: number | null;
};

const STATUS: Record<string,string> = { draft:'Entwurf', sent:'Versendet', paid:'Bezahlt', cancelled:'Storniert' };
const STATUS_COLOR: Record<string,string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  sent: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function AdminInvoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [colFilters, setColFilters] = useState({
    invoice_no: 'all', status: 'all', customer: 'all', invoice_date: 'all', due_date: 'all',
  });

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from('invoices' as any).select('*').order('created_at', { ascending: false }).limit(200)) as any;
    setRows((data as Invoice[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const open = async (i: Invoice) => {
    setSel(i);
    const { data } = await (supabase.from('invoice_items' as any).select('*').eq('invoice_id', i.id).order('position')) as any;
    setItems((data as InvItem[]) || []);
  };

  const save = async () => {
    if (!sel) return;
    const { error } = await (supabase.from('invoices' as any).update({
      status: sel.status, invoice_date: sel.invoice_date, due_date: sel.due_date,
      customer_name: sel.customer_name, customer_email: sel.customer_email, customer_no: sel.customer_no,
      billing_address: sel.billing_address, payment_terms: sel.payment_terms,
      paid_amount: sel.paid_amount, paid_at: sel.paid_at, notes: sel.notes,
      subtotal_amount: sel.subtotal_amount, tax_amount: sel.tax_amount, total_amount: sel.total_amount,
    }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Gespeichert');
    setSel(null); load();
  };

  const markPaid = async () => {
    if (!sel) return;
    await (supabase.from('invoices' as any).update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: sel.total_amount ?? sel.paid_amount }).eq('id', sel.id)) as any;
    toast.success('Als bezahlt markiert');
    setSel(null); load();
  };

  const downloadPdf = () => {
    if (!sel) return;
    const pdf = generateInvoicePdf({
      invoice_no: sel.invoice_no,
      invoice_date: sel.invoice_date,
      due_date: sel.due_date,
      customer_name: sel.customer_name,
      customer_no: sel.customer_no,
      billing_address: sel.billing_address,
      payment_terms: sel.payment_terms,
      notes: sel.notes,
      currency: sel.currency,
      subtotal_amount: sel.subtotal_amount,
      tax_amount: sel.tax_amount,
      total_amount: sel.total_amount,
      items: items.map(it => ({
        position: it.position, art_nr: it.art_nr, description: it.description,
        quantity: it.quantity, unit: it.unit, unit_price: it.unit_price,
        tax_rate: it.tax_rate, line_total: it.line_total,
      })),
    });
    pdf.save(`${sel.invoice_no}.pdf`);
  };

  const filtered = useMemo(() => {
    let out = filter === 'all' ? rows : rows.filter(r => r.status === filter);
    if (colFilters.invoice_no !== 'all') out = out.filter(r => r.invoice_no === colFilters.invoice_no);
    if (colFilters.status !== 'all') out = out.filter(r => r.status === colFilters.status);
    if (colFilters.customer !== 'all') out = out.filter(r => (r.customer_name || '—') === colFilters.customer);
    if (colFilters.invoice_date !== 'all') out = out.filter(r => (r.invoice_date || '—') === colFilters.invoice_date);
    if (colFilters.due_date !== 'all') out = out.filter(r => (r.due_date || '—') === colFilters.due_date);
    return out;
  }, [rows, filter, colFilters]);
  const opts = useMemo(() => {
    const uniq = (arr: (string | null | undefined)[]) => Array.from(new Set(arr.map(v => v ?? '—'))).filter(Boolean).sort();
    return {
      invoice_no: uniq(rows.map(r => r.invoice_no)),
      status: uniq(rows.map(r => r.status)),
      customer: uniq(rows.map(r => r.customer_name)),
      invoice_date: uniq(rows.map(r => r.invoice_date)).reverse(),
      due_date: uniq(rows.map(r => r.due_date)).reverse(),
    };
  }, [rows]);
  const totals = useMemo(() => {
    const open = rows.filter(r => r.status === 'sent').reduce((s,r) => s + (Number(r.total_amount)||0) - Number(r.paid_amount||0), 0);
    const paid = rows.filter(r => r.status === 'paid').reduce((s,r) => s + (Number(r.total_amount)||0), 0);
    return { open, paid };
  }, [rows]);

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> Rechnungen</h1>
            <p className="text-sm text-muted-foreground mt-1">Ausgangsrechnungen — aus Bestellung oder Lieferschein, sowie ISSOS-Historie.</p>
          </div>
        </div>

        <Tabs defaultValue="outgoing" className="space-y-4">
          <TabsList>
            <TabsTrigger value="outgoing">Ausgangsrechnungen</TabsTrigger>
            <TabsTrigger value="issos">ISSOS-Rechnungen</TabsTrigger>
          </TabsList>

          <TabsContent value="outgoing" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Neue Rechnung</Button>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Offene Posten</div><div className="text-lg tabular-nums">{totals.open.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div></Card>
              <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Bezahlt (gesamt)</div><div className="text-lg tabular-nums">{totals.paid.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div></Card>
            </div>

            <div className="flex gap-2">
              {['all','draft','sent','paid','cancelled'].map(s => (
                <Button key={s} size="sm" variant={filter===s?'default':'outline'} onClick={() => setFilter(s)} className="text-xs">
                  {s==='all'?'Alle':STATUS[s]}
                </Button>
              ))}
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Nr.</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Kunde</th>
                    <th className="text-left p-3 font-medium">Datum</th>
                    <th className="text-left p-3 font-medium">Fällig</th>
                    <th className="text-right p-3 font-medium">Summe</th>
                    <th className="text-right p-3 font-medium">Bezahlt</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
                  : filtered.length===0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Keine Rechnungen</td></tr>
                  : filtered.map(r => (
                    <tr key={r.id} onClick={() => open(r)} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer">
                      <td className="p-3 font-mono text-xs">{r.invoice_no}</td>
                      <td className="p-3"><Badge variant="outline" className={STATUS_COLOR[r.status]}>{STATUS[r.status]}</Badge></td>
                      <td className="p-3">{r.customer_name || '—'}</td>
                      <td className="p-3">{r.invoice_date || '—'}</td>
                      <td className="p-3">{r.due_date || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{r.total_amount != null ? `${Number(r.total_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${r.currency}` : '—'}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{Number(r.paid_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="issos">
            <IssosInvoicesTab />
          </TabsContent>
        </Tabs>

        <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />

        <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{sel?.invoice_no}</span>
                {sel && <Badge variant="outline" className={STATUS_COLOR[sel.status]}>{STATUS[sel.status]}</Badge>}
              </DialogTitle>
            </DialogHeader>
            {sel && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Kunde</Label><Input value={sel.customer_name || ''} onChange={e => setSel({...sel, customer_name: e.target.value})} /></div>
                  <div><Label className="text-xs">Kunden-Nr.</Label><Input value={sel.customer_no || ''} onChange={e => setSel({...sel, customer_no: e.target.value})} /></div>
                  <div><Label className="text-xs">E-Mail</Label><Input value={sel.customer_email || ''} onChange={e => setSel({...sel, customer_email: e.target.value})} /></div>
                  <div><Label className="text-xs">Status</Label>
                    <Select value={sel.status} onValueChange={(v: any) => setSel({...sel, status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(STATUS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Rechnungsdatum</Label><Input type="date" value={sel.invoice_date || ''} onChange={e => setSel({...sel, invoice_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Fälligkeit</Label><Input type="date" value={sel.due_date || ''} onChange={e => setSel({...sel, due_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Zahlungsbedingungen</Label><Input value={sel.payment_terms || ''} onChange={e => setSel({...sel, payment_terms: e.target.value})} /></div>
                  <div><Label className="text-xs">Bezahlt</Label><Input type="number" step="0.01" value={sel.paid_amount} onChange={e => setSel({...sel, paid_amount: Number(e.target.value)})} /></div>
                  <div className="col-span-2"><Label className="text-xs">Rechnungsadresse</Label><Textarea rows={2} value={sel.billing_address || ''} onChange={e => setSel({...sel, billing_address: e.target.value})} /></div>
                </div>

                <div>
                  <Label className="text-xs">Positionen</Label>
                  <Card className="mt-1 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr><th className="text-left p-2">#</th><th className="text-left p-2">Artikel</th><th className="text-left p-2">Bezeichnung</th><th className="text-right p-2">Menge</th><th className="text-right p-2">EP</th><th className="text-right p-2">USt%</th><th className="text-right p-2">Summe</th></tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Keine Positionen</td></tr>
                        : items.map(it => (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="p-2">{it.position}</td>
                            <td className="p-2 font-mono">{it.art_nr || '—'}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right tabular-nums">{it.quantity} {it.unit || ''}</td>
                            <td className="p-2 text-right tabular-nums">{it.unit_price?.toFixed(2) ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{it.tax_rate ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{it.line_total?.toFixed(2) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/20 text-xs">
                        <tr className="border-t border-border"><td colSpan={6} className="p-2 text-right text-muted-foreground">Zwischensumme</td><td className="p-2 text-right tabular-nums">{Number(sel.subtotal_amount||0).toFixed(2)}</td></tr>
                        <tr><td colSpan={6} className="p-2 text-right text-muted-foreground">USt.</td><td className="p-2 text-right tabular-nums">{Number(sel.tax_amount||0).toFixed(2)}</td></tr>
                        <tr><td colSpan={6} className="p-2 text-right font-medium">Gesamt</td><td className="p-2 text-right tabular-nums font-medium">{Number(sel.total_amount||0).toFixed(2)} {sel.currency}</td></tr>
                      </tfoot>
                    </table>
                  </Card>
                </div>

                <div><Label className="text-xs">Notizen</Label><Textarea rows={2} value={sel.notes || ''} onChange={e => setSel({...sel, notes: e.target.value})} /></div>
              </div>
            )}
            <DialogFooter>
              {items.length > 0 && <Button variant="outline" onClick={downloadPdf}><Download className="h-4 w-4 mr-1" /> PDF</Button>}
              {sel?.status !== 'paid' && sel?.status !== 'cancelled' && <Button variant="default" onClick={markPaid}>Als bezahlt</Button>}
              <Button variant="outline" onClick={() => setSel(null)}>Schließen</Button>
              <Button onClick={save}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function CreateInvoiceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [sourceType, setSourceType] = useState<'order' | 'delivery'>('order');
  const [list, setList] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSourceId('');
    (async () => {
      if (sourceType === 'order') {
        const { data } = await supabase.from('orders').select('id, order_no, customer_name, customer_email, customer_no').order('created_at', { ascending: false }).limit(100);
        setList(data || []);
      } else {
        const { data } = await (supabase.from('deliveries' as any).select('id, delivery_no, order_id, orders(order_no, customer_name, customer_email, customer_no)').eq('status', 'shipped').order('created_at', { ascending: false }).limit(100)) as any;
        setList(data || []);
      }
    })();
  }, [open, sourceType]);

  const create = async () => {
    if (!sourceId) return toast.error('Quelle wählen');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const src = list.find(x => x.id === sourceId);
    const orderId = sourceType === 'order' ? sourceId : src?.order_id || null;
    const cust = sourceType === 'order' ? src : src?.orders;
    const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 14);

    let itemsToCopy: any[] = [];
    if (sourceType === 'order') {
      const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('position');
      itemsToCopy = (data || []).map((it: any) => ({
        position: it.position, art_nr: it.art_nr || it.sku, description: it.description,
        quantity: Number(it.quantity), unit: it.unit, unit_price: it.unit_price != null ? Number(it.unit_price) : null,
        tax_rate: it.tax_rate != null ? Number(it.tax_rate) : 19, line_total: it.line_total != null ? Number(it.line_total) : (Number(it.quantity) * Number(it.unit_price || 0)),
      }));
    } else {
      const { data: di } = await (supabase.from('delivery_items' as any).select('*').eq('delivery_id', sourceId).order('position')) as any;
      // Preise aus order_items ziehen
      const orderItemIds = (di || []).map((x: any) => x.order_item_id).filter(Boolean);
      const { data: oi } = orderItemIds.length ? await supabase.from('order_items').select('*').in('id', orderItemIds) : { data: [] as any[] };
      const priceMap = new Map((oi || []).map((x: any) => [x.id, x]));
      itemsToCopy = (di || []).map((it: any, idx: number) => {
        const ref = priceMap.get(it.order_item_id);
        const qty = Number(it.quantity); const up = ref?.unit_price != null ? Number(ref.unit_price) : null;
        return {
          position: it.position || idx+1, art_nr: it.art_nr, description: it.description,
          quantity: qty, unit: it.unit, unit_price: up,
          tax_rate: ref?.tax_rate != null ? Number(ref.tax_rate) : 19,
          line_total: up != null ? qty * up : null,
        };
      });
    }

    const subtotal = itemsToCopy.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
    const tax = itemsToCopy.reduce((s, it) => s + (Number(it.line_total) || 0) * (Number(it.tax_rate || 0) / 100), 0);
    const total = subtotal + tax;

    const { data: inv, error } = await (supabase.from('invoices' as any).insert({
      order_id: orderId,
      delivery_id: sourceType === 'delivery' ? sourceId : null,
      status: 'draft',
      invoice_date: today.toISOString().slice(0,10),
      due_date: due.toISOString().slice(0,10),
      customer_name: cust?.customer_name || null,
      customer_email: cust?.customer_email || null,
      customer_no: cust?.customer_no || null,
      currency: 'EUR',
      subtotal_amount: subtotal, tax_amount: tax, total_amount: total,
      created_by: user?.id ?? null,
    }).select().single()) as any;

    if (error || !inv) { setBusy(false); return toast.error(error?.message || 'Fehler'); }
    if (itemsToCopy.length) {
      await (supabase.from('invoice_items' as any).insert(itemsToCopy.map(it => ({ ...it, invoice_id: inv.id })))) as any;
    }
    setBusy(false);
    toast.success(`Rechnung ${inv.invoice_no} erstellt`);
    onCreated(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Rechnung</DialogTitle>
          <DialogDescription>Positionen, Preise und USt. werden übernommen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={sourceType==='order'?'default':'outline'} onClick={() => setSourceType('order')}>Aus Bestellung</Button>
            <Button type="button" size="sm" variant={sourceType==='delivery'?'default':'outline'} onClick={() => setSourceType('delivery')}>Aus Lieferschein</Button>
          </div>
          <div>
            <Label className="text-xs">{sourceType === 'order' ? 'Bestellung' : 'Lieferschein'}</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {list.map((x: any) => (
                  <SelectItem key={x.id} value={x.id}>
                    {sourceType === 'order'
                      ? `${x.order_no} · ${x.customer_name || '—'}`
                      : `${x.delivery_no} · ${x.orders?.order_no || ''} · ${x.orders?.customer_name || '—'}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={create} disabled={busy}>{busy ? 'Erstellt…' : 'Erstellen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
