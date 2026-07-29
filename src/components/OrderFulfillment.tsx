import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Package, Truck, Receipt, ExternalLink, Split } from "lucide-react";
import { PartialFulfillDialog } from "@/components/PartialFulfillDialog";

type Item = { id: string; position: number; sku: string | null; description: string; quantity: number; unit: string | null; unit_price?: number | null; tax_rate?: number | null };
type Warehouse = { id: string; code: string; name: string };
type Row = { item: Item; art_nr: string | null; stock: number; reserved: number; delivered: number; invoiced: number };
type Delivery = { id: string; delivery_no: string; status: string };
type Invoice = { id: string; invoice_no: string; status: string };


const DLV_COLOR: Record<string,string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  shipped: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const INV_COLOR: Record<string,string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  sent: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export function OrderFulfillment({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: its }, { data: whs }, { data: dlvs }, { data: invs }] = await Promise.all([
      supabase.from('order_items').select('id, position, sku, description, quantity, unit, art_nr, unit_price, tax_rate, qty_delivered, qty_invoiced').eq('order_id', orderId).order('position'),
      supabase.from('warehouses').select('id, code, name').order('code'),
      (supabase.from('deliveries' as any).select('id, delivery_no, status').eq('order_id', orderId).order('created_at', { ascending: false })) as any,
      (supabase.from('invoices' as any).select('id, invoice_no, status').eq('order_id', orderId).order('created_at', { ascending: false })) as any,
    ]);

    const items = (its as any[]) || [];
    const whList = (whs as Warehouse[]) || [];
    setWarehouses(whList);
    if (whList.length && !warehouseId) setWarehouseId(whList[0].id);
    setDeliveries((dlvs as Delivery[]) || []);
    setInvoices((invs as Invoice[]) || []);

    const artNrs = items.map((it: any) => it.art_nr || it.sku).filter(Boolean);
    const [{ data: stock }, { data: reserv }] = await Promise.all([
      artNrs.length ? supabase.from('inventory_stock').select('art_nr, quantity').in('art_nr', artNrs) : Promise.resolve({ data: [] as any[] }),
      artNrs.length ? supabase.from('stock_reservations').select('art_nr, quantity').eq('order_id', orderId).eq('status', 'open') : Promise.resolve({ data: [] as any[] }),
    ]);

    const stockMap = new Map<string, number>();
    (stock || []).forEach((s: any) => stockMap.set(s.art_nr, (stockMap.get(s.art_nr) || 0) + Number(s.quantity)));
    const resMap = new Map<string, number>();
    (reserv || []).forEach((r: any) => resMap.set(r.art_nr, (resMap.get(r.art_nr) || 0) + Number(r.quantity)));

    setRows(items.map((it: any) => {
      const an = it.art_nr || it.sku;
      return {
        item: it,
        art_nr: an,
        stock: an ? (stockMap.get(an) || 0) : 0,
        reserved: an ? (resMap.get(an) || 0) : 0,
        delivered: Number(it.qty_delivered || 0),
        invoiced: Number(it.qty_invoiced || 0),
      };
    }));

  }, [orderId, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const reserveAll = async () => {
    if (!warehouseId) return toast.error('Lager wählen');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const rowsToInsert = rows
      .filter(r => r.art_nr)
      .map(r => {
        const open = Math.max(0, r.item.quantity - r.reserved - r.delivered);
        return open > 0 ? { art_nr: r.art_nr!, warehouse_id: warehouseId, quantity: open, order_id: orderId, status: 'open', created_by: user?.id ?? null } : null;
      })
      .filter(Boolean) as any[];
    if (!rowsToInsert.length) { setBusy(false); return toast.info('Nichts zu reservieren'); }
    const { error } = await supabase.from('stock_reservations').insert(rowsToInsert);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${rowsToInsert.length} Position(en) reserviert`);
    load();
  };

  const createDelivery = async () => {
    if (!warehouseId) return toast.error('Lager wählen');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: d, error } = await (supabase.from('deliveries' as any).insert({
      order_id: orderId, status: 'draft', delivery_date: new Date().toISOString().slice(0,10), created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !d) { setBusy(false); return toast.error(error?.message || 'Fehler'); }

    const open = rows
      .map(r => {
        const remaining = Math.max(0, r.item.quantity - r.delivered);
        return remaining > 0 ? {
          delivery_id: d.id, order_item_id: r.item.id, position: r.item.position,
          art_nr: r.art_nr, description: r.item.description, quantity: remaining,
          unit: r.item.unit, warehouse_id: warehouseId,
        } : null;
      })
      .filter(Boolean) as any[];
    if (open.length) await (supabase.from('delivery_items' as any).insert(open)) as any;
    setBusy(false);
    toast.success(`Lieferschein ${d.delivery_no} angelegt`);
    load();
  };

  const createInvoice = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: order } = await supabase.from('orders').select('customer_name, customer_email, customer_no').eq('id', orderId).single();
    const { data: oi } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('position');
    const items = (oi || []).map((it: any) => {
      const qty = Number(it.quantity); const up = it.unit_price != null ? Number(it.unit_price) : null;
      const rate = it.tax_rate != null ? Number(it.tax_rate) : 19;
      return {
        position: it.position, art_nr: it.art_nr || it.sku, description: it.description,
        quantity: qty, unit: it.unit, unit_price: up, tax_rate: rate,
        line_total: up != null ? qty * up : null,
      };
    });
    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
    const tax = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0) * (Number(it.tax_rate || 0) / 100), 0);
    const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 14);

    const { data: inv, error } = await (supabase.from('invoices' as any).insert({
      order_id: orderId, status: 'draft',
      invoice_date: today.toISOString().slice(0,10), due_date: due.toISOString().slice(0,10),
      customer_name: order?.customer_name, customer_email: order?.customer_email, customer_no: order?.customer_no,
      currency: 'EUR', subtotal_amount: subtotal, tax_amount: tax, total_amount: subtotal + tax,
      created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !inv) { setBusy(false); return toast.error(error?.message || 'Fehler'); }
    if (items.length) await (supabase.from('invoice_items' as any).insert(items.map(it => ({ ...it, invoice_id: inv.id })))) as any;
    setBusy(false);
    toast.success(`Rechnung ${inv.invoice_no} angelegt`);
    load();
  };

  const totalOpen = rows.reduce((s, r) => s + Math.max(0, r.item.quantity - r.delivered), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Abwicklung</Label>
        <div className="flex items-center gap-2">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Lager…" /></SelectTrigger>
            <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={busy || totalOpen === 0} onClick={reserveAll}>Reservieren</Button>
          <Button size="sm" variant="outline" disabled={busy || totalOpen === 0} onClick={createDelivery}><Truck className="h-3 w-3 mr-1" /> Lieferschein</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={createInvoice}><Receipt className="h-3 w-3 mr-1" /> Rechnung</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Artikel</th>
              <th className="text-left p-2">Bezeichnung</th>
              <th className="text-right p-2">Bestellt</th>
              <th className="text-right p-2">Bestand</th>
              <th className="text-right p-2">Reserviert</th>
              <th className="text-right p-2">Geliefert</th>
              <th className="text-right p-2">Offen</th>
              <th className="text-right p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">Keine Positionen</td></tr>
            : rows.map(r => {
              const open = Math.max(0, r.item.quantity - r.delivered);
              const coverage = r.art_nr ? (r.stock >= open ? 'ok' : r.stock > 0 ? 'partial' : 'none') : 'unknown';
              return (
                <tr key={r.item.id} className="border-t border-border/40">
                  <td className="p-2 font-mono">{r.art_nr || '—'}</td>
                  <td className="p-2">{r.item.description}</td>
                  <td className="p-2 text-right tabular-nums">{r.item.quantity} {r.item.unit || ''}</td>
                  <td className="p-2 text-right tabular-nums">{r.art_nr ? r.stock : '—'}</td>
                  <td className="p-2 text-right tabular-nums">{r.reserved || '—'}</td>
                  <td className="p-2 text-right tabular-nums">{r.delivered || '—'}</td>
                  <td className="p-2 text-right tabular-nums">{open || '—'}</td>
                  <td className="p-2 text-right">
                    {open === 0 ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">geliefert</Badge>
                    : coverage === 'ok' ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">lieferbar</Badge>
                    : coverage === 'partial' ? <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">teilweise</Badge>
                    : coverage === 'none' ? <Badge variant="outline" className="bg-rose-500/15 text-rose-300 border-rose-500/30 text-[10px]">Rückstand</Badge>
                    : <Badge variant="outline" className="text-[10px]">—</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {(deliveries.length > 0 || invoices.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Lieferscheine</div>
            <div className="space-y-1">
              {deliveries.length === 0 ? <div className="text-xs text-muted-foreground">—</div>
              : deliveries.map(d => (
                <button key={d.id} onClick={() => navigate('/admin/deliveries')} className="w-full flex items-center justify-between p-2 rounded border border-border/40 hover:bg-muted/20 text-xs">
                  <span className="font-mono">{d.delivery_no}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={`${DLV_COLOR[d.status]} text-[10px]`}>{d.status}</Badge>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Rechnungen</div>
            <div className="space-y-1">
              {invoices.length === 0 ? <div className="text-xs text-muted-foreground">—</div>
              : invoices.map(i => (
                <button key={i.id} onClick={() => navigate('/admin/invoices')} className="w-full flex items-center justify-between p-2 rounded border border-border/40 hover:bg-muted/20 text-xs">
                  <span className="font-mono">{i.invoice_no}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={`${INV_COLOR[i.status]} text-[10px]`}>{i.status}</Badge>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
