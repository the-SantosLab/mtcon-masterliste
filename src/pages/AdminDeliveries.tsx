import { FulfillmentHeader, FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
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
import { Truck, Plus, Trash2, Receipt, FlaskConical } from "lucide-react";
import { ErpDocPdfButton } from "@/components/ErpDocPdfButton";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IssosDeliveriesTab } from "@/components/IssosDeliveriesTab";
import { DeliveryDemoDialog } from "@/components/DeliveryDemoDialog";

type Delivery = {
  id: string;
  delivery_no: string;
  order_id: string | null;
  status: 'draft' | 'shipped' | 'cancelled';
  delivery_date: string | null;
  ship_to: string | null;
  carrier: string | null;
  tracking_no: string | null;
  tracking_url: string | null;
  tracking_pushed_at: string | null;
  notes: string | null;
  created_at: string;
  orders?: { order_no: string; customer_name: string | null } | null;
};

type DeliveryItem = {
  id: string;
  delivery_id: string;
  order_item_id: string | null;
  position: number;
  art_nr: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  warehouse_id: string | null;
  lot_no: string | null;
  serial_no: string | null;
};

type Warehouse = { id: string; code: string; name: string };

const STATUS: Record<string, string> = { draft: 'Entwurf', shipped: 'Versendet', cancelled: 'Storniert' };
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-status-open/15 text-status-open border-status-open/30',
  shipped: 'bg-status-done/15 text-status-done border-status-done/30',
  cancelled: 'bg-status-rejected/15 text-status-rejected border-status-rejected/30',
};

export default function AdminDeliveries() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [sel, setSel] = useState<Delivery | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const [d, w] = await Promise.all([
      (supabase.from('deliveries' as any).select('*, orders(order_no, customer_name)').order('created_at', { ascending: false }).limit(200)),
      supabase.from('warehouses').select('id,code,name').order('code'),
    ]);
    setRows(((d as any).data as Delivery[]) || []);
    setWarehouses((w.data as Warehouse[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const open = async (d: Delivery) => {
    setSel(d);
    const [iRes, invRes] = await Promise.all([
      (supabase.from('delivery_items' as any).select('*').eq('delivery_id', d.id).order('position')) as any,
      (supabase.from('invoices' as any).select('id').eq('delivery_id', d.id).maybeSingle()) as any,
    ]);
    setItems((iRes.data as DeliveryItem[]) || []);
    setExistingInvoiceId(invRes.data?.id ?? null);
  };

  const createInvoiceFromDelivery = async () => {
    if (!sel) return;
    if (existingInvoiceId) { toast.error('Rechnung existiert bereits'); return; }
    const { data: { user } } = await supabase.auth.getUser();

    // Order-Header + Preise
    const [{ data: ord }, { data: di }] = await Promise.all([
      sel.order_id ? supabase.from('orders').select('*').eq('id', sel.order_id).maybeSingle() : Promise.resolve({ data: null }) as any,
      (supabase.from('delivery_items' as any).select('*').eq('delivery_id', sel.id).order('position')) as any,
    ]);
    const orderItemIds = (di || []).map((x: any) => x.order_item_id).filter(Boolean);
    const { data: oi } = orderItemIds.length
      ? await supabase.from('order_items').select('*').in('id', orderItemIds)
      : { data: [] as any[] };
    const priceMap = new Map((oi || []).map((x: any) => [x.id, x]));

    const itemsToCopy = (di || []).map((it: any, idx: number) => {
      const ref: any = priceMap.get(it.order_item_id);
      const qty = Number(it.quantity);
      const up = ref?.unit_price != null ? Number(ref.unit_price) : 0;
      const tr = ref?.tax_rate != null ? Number(ref.tax_rate) : 19;
      return {
        position: it.position || idx + 1, art_nr: it.art_nr, description: it.description,
        quantity: qty, unit: it.unit, unit_price: up, tax_rate: tr, line_total: qty * up,
      };
    });
    const subtotal = itemsToCopy.reduce((s, it) => s + it.line_total, 0);
    const tax = itemsToCopy.reduce((s, it) => s + it.line_total * (it.tax_rate / 100), 0);
    const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 14);

    const { data: inv, error } = await (supabase.from('invoices' as any).insert({
      order_id: sel.order_id, delivery_id: sel.id, status: 'draft',
      invoice_date: today.toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10),
      customer_name: (ord as any)?.customer_name ?? sel.orders?.customer_name ?? null,
      customer_email: (ord as any)?.customer_email ?? null,
      customer_no: (ord as any)?.customer_no ?? null,
      currency: (ord as any)?.currency ?? 'EUR',
      subtotal_amount: subtotal, tax_amount: tax, total_amount: subtotal + tax,
      payment_terms: (ord as any)?.payment_terms ?? null,
      notes: `Aus Lieferschein ${sel.delivery_no}`,
      created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !inv) return toast.error(error?.message || 'Fehler beim Anlegen');

    if (itemsToCopy.length) {
      await (supabase.from('invoice_items' as any).insert(
        itemsToCopy.map(it => ({ ...it, invoice_id: inv.id }))
      )) as any;
    }
    setExistingInvoiceId(inv.id);
    toast.success(`Rechnung ${inv.invoice_no} erstellt`);
    navigate('/rechnungen');
  };

  const save = async () => {
    if (!sel) return;
    const { error } = await (supabase.from('deliveries' as any).update({
      status: sel.status, delivery_date: sel.delivery_date, ship_to: sel.ship_to,
      carrier: sel.carrier, tracking_no: sel.tracking_no, tracking_url: sel.tracking_url, notes: sel.notes,
    }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message.replace(/^.*?(Lieferschein)/, '$1'));
    toast.success('Gespeichert');
    setSel(null); load();
  };

  const pushTracking = async () => {
    if (!sel) return;
    if (!sel.tracking_no) return toast.error('Tracking-Nr. fehlt');
    // Reset tracking_pushed_at and re-update tracking_no to trigger push
    await (supabase.from('deliveries' as any).update({ tracking_pushed_at: null }).eq('id', sel.id)) as any;
    const { error } = await (supabase.from('deliveries' as any).update({
      tracking_no: sel.tracking_no, tracking_url: sel.tracking_url, carrier: sel.carrier, status: 'shipped',
    }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Tracking an Vertrieb gepusht');
    open(sel);
  };

  const ship = async () => {
    if (!sel) return;
    // Versand nur, wenn der Lieferschein erstellt/gedruckt wurde (PDF sperrt den Beleg)
    const { data: chk } = await (supabase.from('deliveries' as any).select('locked').eq('id', sel.id).single()) as any;
    if (!chk?.locked) {
      return toast.error('Lieferschein ist noch ein Entwurf – bitte zuerst über „Lieferschein" erstellen bzw. drucken, dann versenden.');
    }
    // Lagerausbuchung + Reservierungsverbrauch erfolgen serverseitig (Trigger, idempotent)
    const { error } = await (supabase.from('deliveries' as any).update({ status: 'shipped' }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success(`${items.length} Position(en) ausgebucht`);
    setSel(null); load();
  };

  const delItem = async (id: string) => {
    await (supabase.from('delivery_items' as any).delete().eq('id', id)) as any;
    if (sel) open(sel);
  };

  const filtered = useMemo(() => rows.filter(r => (filter === 'all' || r.status === filter) && `${r.delivery_no} ${r.orders?.order_no || ''} ${r.orders?.customer_name || ''} ${r.tracking_no || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, filter, search]);

  return (
    <AppLayout>
      <div className="fulfillment-page">
        <FulfillmentHeader title="Lieferscheine" subtitle="Lieferung · Versand · Sendungsverfolgung" />

        <Tabs defaultValue="intern" className="w-full">
          <TabsList>
            <TabsTrigger value="intern">Intern</TabsTrigger>
            <TabsTrigger value="issos">ISSOS</TabsTrigger>
          </TabsList>
          <TabsContent value="intern" className="space-y-4 mt-4">
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setDemoOpen(true)}>
            <FlaskConical className="h-4 w-4 mr-1" /> Demo-PDF
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Neuer Lieferschein</Button>
        </div>


        <FulfillmentMetrics loading={loading} metrics={[
          { label: 'Lieferscheine gesamt', value: rows.length, onClick: () => setFilter('all'), active: filter === 'all' },
          { label: 'Entwürfe', value: rows.filter(r => r.status === 'draft').length, tone: 'working', onClick: () => setFilter('draft'), active: filter === 'draft' },
          { label: 'Versendet', value: rows.filter(r => r.status === 'shipped').length, tone: 'done', onClick: () => setFilter('shipped'), active: filter === 'shipped' },
          { label: 'Storniert', value: rows.filter(r => r.status === 'cancelled').length, onClick: () => setFilter('cancelled'), active: filter === 'cancelled' },
        ]} />
        <div className="fulfillment-toolbar">
          <Input aria-label="Lieferscheine suchen" placeholder="Lieferschein, Kunde oder Tracking…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm h-9 text-xs" />
          <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-44 h-9 text-xs" aria-label="Lieferstatus"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Status</SelectItem>{Object.entries(STATUS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} Lieferscheine</span>
        </div>

        <Card className="fulfillment-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Nr.</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Bestellung</th>
                <th className="text-left p-3 font-medium">Kunde</th>
                <th className="text-left p-3 font-medium">Versand</th>
                <th className="text-left p-3 font-medium">Tracking</th>
                <th className="text-left p-3 font-medium">Erstellt</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Keine Lieferscheine</td></tr>
                : filtered.map(d => (
                  <tr key={d.id} onClick={() => open(d)} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer">
                    <td className="p-3 font-mono text-xs">{d.delivery_no}</td>
                    <td className="p-3"><Badge variant="outline" className={STATUS_COLOR[d.status]}>{STATUS[d.status]}</Badge></td>
                    <td className="p-3 font-mono text-xs">{d.orders?.order_no || '—'}</td>
                    <td className="p-3">{d.orders?.customer_name || '—'}</td>
                    <td className="p-3">{d.delivery_date || '—'}</td>
                    <td className="p-3 text-xs">{d.tracking_no || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{format(new Date(d.created_at), 'dd.MM.yyyy')}</td>
                    <td className="p-1 text-right" onClick={(e) => e.stopPropagation()}><ErpDocPdfButton type="lieferschein" id={d.id} iconOnly variant="ghost" /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>

        <CreateDeliveryDialog open={createOpen} onClose={() => setCreateOpen(false)} warehouses={warehouses} onCreated={load} />

        <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{sel?.delivery_no}</span>
                {sel && <Badge variant="outline" className={STATUS_COLOR[sel.status]}>{STATUS[sel.status]}</Badge>}
              </DialogTitle>
            </DialogHeader>
            {sel && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Versanddatum</Label><Input type="date" value={sel.delivery_date || ''} onChange={e => setSel({ ...sel, delivery_date: e.target.value || null })} /></div>
                  <div><Label className="text-xs">Spedition</Label><Input value={sel.carrier || ''} onChange={e => setSel({ ...sel, carrier: e.target.value })} /></div>
                  <div><Label className="text-xs">Tracking-Nr.</Label><Input value={sel.tracking_no || ''} onChange={e => setSel({ ...sel, tracking_no: e.target.value })} /></div>
                  <div><Label className="text-xs">Status</Label>
                    <Select value={sel.status} onValueChange={(v: any) => setSel({ ...sel, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(STATUS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-xs">Tracking-URL (optional, sonst auto aus Spediteur)</Label><Input value={sel.tracking_url || ''} placeholder="https://…" onChange={e => setSel({ ...sel, tracking_url: e.target.value })} /></div>
                  <div className="col-span-2"><Label className="text-xs">Lieferadresse</Label><Textarea rows={2} value={sel.ship_to || ''} onChange={e => setSel({ ...sel, ship_to: e.target.value })} /></div>
                  <div className="col-span-2"><Label className="text-xs">Notizen</Label><Textarea rows={2} value={sel.notes || ''} onChange={e => setSel({ ...sel, notes: e.target.value })} /></div>
                  {sel.tracking_pushed_at && (
                    <div className="col-span-2 text-[11px] text-status-done">
                      Tracking an Vertrieb gepusht am {format(new Date(sel.tracking_pushed_at), 'dd.MM.yyyy HH:mm')}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Positionen</Label>
                  <Card className="mt-1 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">#</th><th className="text-left p-2">Artikel</th><th className="text-left p-2">Bezeichnung</th>
                          <th className="text-right p-2">Menge</th><th className="text-left p-2">Lager</th>
                          <th className="text-left p-2">Charge / SN</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Keine Positionen</td></tr>
                        : items.map(it => (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="p-2">{it.position}</td>
                            <td className="p-2 font-mono">{it.art_nr || '—'}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right tabular-nums">{it.quantity} {it.unit || ''}</td>
                            <td className="p-2">{warehouses.find(w => w.id === it.warehouse_id)?.code || '—'}</td>
                            <td className="p-2 text-muted-foreground">{[it.lot_no, it.serial_no].filter(Boolean).join(' / ') || '—'}</td>
                            <td className="p-2 text-right">{sel.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => delItem(it.id)}><Trash2 className="h-3 w-3" /></Button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              </div>
            )}
            <DialogFooter>
              {items.length > 0 && sel && (
                <>
                  <ErpDocPdfButton type="lieferschein" id={sel.id} label="Lieferschein" />
                  <ErpDocPdfButton type="ruecklieferschein" id={sel.id} label="Rücklieferung" variant="ghost" />
                </>
              )}
              {sel?.status === 'draft' && items.length > 0 && (
                <Button variant="default" onClick={ship}>Versenden &amp; ausbuchen</Button>
              )}
              {sel?.status === 'shipped' && sel.tracking_no && (
                <Button variant="outline" onClick={pushTracking}>
                  <Truck className="h-4 w-4 mr-1" />
                  {sel.tracking_pushed_at ? 'Tracking erneut pushen' : 'Tracking pushen'}
                </Button>
              )}
              {sel?.status === 'shipped' && (
                existingInvoiceId
                  ? <Button variant="outline" onClick={() => navigate('/rechnungen')}><Receipt className="h-4 w-4 mr-1" /> Rechnung öffnen</Button>
                  : <Button variant="default" onClick={createInvoiceFromDelivery}><Receipt className="h-4 w-4 mr-1" /> Rechnung 1:1 erstellen</Button>
              )}
              <Button variant="outline" onClick={() => setSel(null)}>Schließen</Button>
              <Button onClick={save}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </TabsContent>
          <TabsContent value="issos" className="mt-4">
            <IssosDeliveriesTab />
          </TabsContent>
        </Tabs>
        <DeliveryDemoDialog open={demoOpen} onClose={() => setDemoOpen(false)} />
      </div>
    </AppLayout>

  );
}

function CreateDeliveryDialog({ open, onClose, warehouses, onCreated }: {
  open: boolean; onClose: () => void; warehouses: Warehouse[]; onCreated: () => void;
}) {
  const [orders, setOrders] = useState<{ id: string; order_no: string; customer_name: string | null }[]>([]);
  const [orderId, setOrderId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrderId(''); setWarehouseId(warehouses[0]?.id || '');
    supabase.from('orders').select('id, order_no, customer_name').in('status', ['active','in_progress']).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setOrders((data as any) || []));
  }, [open, warehouses]);

  const create = async () => {
    if (!orderId) { toast.error('Bestellung wählen'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: d, error } = await (supabase.from('deliveries' as any).insert({
      order_id: orderId, status: 'draft', delivery_date: new Date().toISOString().slice(0,10), created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !d) { setBusy(false); return toast.error(error?.message || 'Fehler'); }

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('position');
    if (oItems?.length) {
      const rows = (oItems as any[]).map(it => ({
        delivery_id: d.id, order_item_id: it.id, position: it.position, art_nr: it.art_nr || it.sku,
        description: it.description, quantity: it.quantity, unit: it.unit, warehouse_id: warehouseId || null,
      }));
      await (supabase.from('delivery_items' as any).insert(rows)) as any;
    }
    setBusy(false);
    toast.success(`Lieferschein ${d.delivery_no} erstellt`);
    onCreated(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Lieferschein</DialogTitle>
          <DialogDescription>Positionen werden aus der Bestellung übernommen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Bestellung</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger><SelectValue placeholder="Bestellung wählen…" /></SelectTrigger>
              <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_no} · {o.customer_name || '—'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vorgabe-Lager für Positionen</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Lager…" /></SelectTrigger>
              <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}</SelectContent>
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
