import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArticlePicker } from '@/components/ArticlePicker';
import { Plus, RefreshCw, Trash2, PackageMinus, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { canIssue, canReceive, parseMaterialQuantity, validReturn, hasOpenSubcontractSteps } from '@/lib/subcontracting';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';

type Order = Tables<'subcontract_orders'>;
type Item = Tables<'subcontract_order_items'>;
type Receipt = Tables<'subcontract_receipts'>;
type Warehouse = Pick<Tables<'warehouses'>, 'id' | 'name'>;
type Supplier = Pick<Tables<'suppliers'>, 'id' | 'name'>;
const labels: Record<string, string> = { draft: 'Entwurf', issued: 'Beim Lieferanten', partial: 'Teilrücklieferung', completed: 'Abgeschlossen', cancelled: 'Storniert' };
const fmt = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });

type ProductionContext = { id: string; wo_no: string | null; warehouse_id: string; canCreate: boolean };

export function SubcontractOrders({ receiptsOnly = false, productionOrder, onStepsChange }: { receiptsOnly?: boolean; productionOrder?: ProductionContext; onStepsChange?: (open: boolean) => void }) {
  const { isAdmin, role } = useAuth();
  const writable = isAdmin || role === 'staff';
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('open');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expected, setExpected] = useState('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState([{ key: crypto.randomUUID(), art_nr: '', quantity: '1' }]);
  const [items, setItems] = useState<Item[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [returnWarehouse, setReturnWarehouse] = useState('');
  const [deliveryNo, setDeliveryNo] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    setBusy(true); setError('');
    const [o, s, w] = await Promise.all([
      productionOrder ? supabase.from('subcontract_orders').select('*').eq('production_order_id', productionOrder.id).order('created_at', { ascending: false }) : supabase.from('subcontract_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id,name,is_active').order('name'),
      supabase.from('warehouses').select('id,name').order('name'),
    ]);
    setBusy(false);
    if (o.error || s.error || w.error) { setError(o.error?.message || s.error?.message || w.error?.message || 'Laden fehlgeschlagen'); return; }
    setOrders(o.data || []); setSuppliers(s.data || []); setWarehouses(w.data || []);
    onStepsChange?.(hasOpenSubcontractSteps((o.data || []).map(order => order.status)));
  }, [productionOrder?.id, onStepsChange]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!productionOrder) return;
    const channel = supabase.channel(`workshop-subcontract-${productionOrder.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'subcontract_orders', filter: `production_order_id=eq.${productionOrder.id}` }, () => { void load(); }).subscribe();
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    return () => { void supabase.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [productionOrder?.id, load]);

  const openDetail = async (order: Order) => {
    setSelected(order); setItems([]); setReceipts([]); setDetailLoading(true); setDetailError('');
    setReturnWarehouse(order.warehouse_id); setDeliveryNo(''); setReturns({}); setRequestId(crypto.randomUUID());
    const [i, r] = await Promise.all([
      supabase.from('subcontract_order_items').select('*').eq('order_id', order.id).order('art_nr'),
      supabase.from('subcontract_receipts').select('*').eq('order_id', order.id).order('received_at', { ascending: false }),
    ]);
    setDetailLoading(false);
    if (i.error || r.error) { setDetailError(i.error?.message || r.error?.message || 'Laden fehlgeschlagen'); return; }
    setItems(i.data || []); setReceipts(r.data || []);
  };

  const create = async () => {
    const positions = drafts.map(d => ({ art_nr: d.art_nr, quantity: parseMaterialQuantity(d.quantity) }));
    if (!supplierId || !warehouseId || positions.some(p => !p.art_nr || !Number.isFinite(p.quantity) || p.quantity <= 0)) { toast.error('Lieferant, Lager und gültige Materialpositionen erforderlich'); return; }
    if (new Set(positions.map(p => p.art_nr)).size !== positions.length) { toast.error('Artikel nur einmal je Auftrag erfassen'); return; }
    setBusy(true);
    const { error: e } = productionOrder
      ? await supabase.rpc('create_production_subcontract_step', { _production_order_id: productionOrder.id, _supplier_id: supplierId, _items: positions, _expected_at: expected || undefined, _note: note || undefined })
      : await supabase.rpc('create_subcontract_order', { _supplier_id: supplierId, _warehouse_id: warehouseId, _items: positions, _expected_at: expected || undefined, _note: note || undefined });
    setBusy(false);
    if (e) { toast.error(e.message); return; }
    toast.success(productionOrder ? 'Fremdbearbeitungsschritt angelegt' : 'Fremdbearbeitungsauftrag angelegt'); setCreating(false); await load();
  };

  const issue = async () => {
    if (!selected || !window.confirm(selected.production_order_id ? 'Material jetzt zum externen Bearbeiter verlagern?' : 'Material jetzt an den Lieferanten ausgeben und aus dem Lager ausbuchen?')) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('issue_subcontract_material', { _id: selected.id });
    setBusy(false);
    if (e) { toast.error(e.message); return; }
    toast.success('Materialausgabe gebucht'); setSelected(null); await load();
  };

  const receive = async () => {
    if (!selected) return;
    const entered = items.filter(i => returns[i.id]?.trim());
    if (!returnWarehouse || !entered.length || entered.some(i => !validReturn(parseMaterialQuantity(returns[i.id]), i.qty_issued, i.qty_returned))) { toast.error('Rückmenge muss positiv sein und darf die offene Menge nicht überschreiten'); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc('book_subcontract_receipt', { _id: selected.id, _warehouse_id: returnWarehouse, _items: entered.map(i => ({ item_id: i.id, quantity: parseMaterialQuantity(returns[i.id]) })), _request_id: requestId, _delivery_note_no: deliveryNo || undefined });
    setBusy(false);
    if (e) { toast.error(e.message); return; }
    toast.success('Wareneingang und Rückbuchung gebucht'); setSelected(null); await load();
  };

  const cancel = async () => {
    if (!selected || !window.confirm('Fremdbearbeitungsauftrag stornieren?')) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('cancel_subcontract_order', { _id: selected.id });
    setBusy(false);
    if (e) { toast.error(e.message); return; }
    setSelected(null); await load();
  };
  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.name || '–';
  const filtered = orders.filter(o => {
    if (receiptsOnly ? !canReceive(o.status) : filter === 'open' && ['completed', 'cancelled'].includes(o.status)) return false;
    return `${o.order_no} ${supplierName(o.supplier_id)} ${o.note || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  const warehouseSelect = (value: string, change: (v: string) => void, label: string) => <Select value={value} onValueChange={change}><SelectTrigger aria-label={label}><SelectValue placeholder="Lager wählen" /></SelectTrigger><SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>;

  return <section className="space-y-3">
    {!receiptsOnly && !productionOrder && <FulfillmentMetrics loading={busy} metrics={[
      { label: 'Aufträge gesamt', value: orders.length },
      { label: 'Entwürfe', value: orders.filter(o => o.status === 'draft').length, tone: 'working' },
      { label: 'Beim Lieferanten', value: orders.filter(o => ['issued', 'partial'].includes(o.status)).length, tone: 'overdue' },
      { label: 'Abgeschlossen', value: orders.filter(o => o.status === 'completed').length, tone: 'done' },
    ]} />}
    <div className="flex flex-wrap items-center justify-between gap-2">
      {receiptsOnly && <h2 className="text-sm font-semibold">Rücklieferungen aus Fremdbearbeitung</h2>}
      {productionOrder && <h2 className="text-sm font-semibold">Fremdbearbeitung · {productionOrder.wo_no}</h2>}
      <div className="flex flex-wrap items-center gap-2 w-full">
        <Input aria-label="Fremdbearbeitung suchen" placeholder="Auftrag oder Lieferant suchen…" className="max-w-xs h-8" value={search} onChange={e => setSearch(e.target.value)} />
        {!receiptsOnly && <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-36 h-8" aria-label="Auftragsfilter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Offene</SelectItem><SelectItem value="all">Alle</SelectItem></SelectContent></Select>}
        <Button variant="outline" size="icon" title="Aktualisieren" aria-label="Fremdbearbeitung aktualisieren" disabled={busy} onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {!receiptsOnly && writable && <Button size="sm" className="ml-auto" disabled={busy || (productionOrder && !productionOrder.canCreate)} title={productionOrder && !productionOrder.canCreate ? 'Interne Materialentnahme bereits erfolgt' : undefined} onClick={() => { setSupplierId(''); setWarehouseId(productionOrder?.warehouse_id || ''); setExpected(''); setNote(''); setDrafts([{ key: crypto.randomUUID(), art_nr: '', quantity: '1' }]); setCreating(true); }}><Plus className="h-4 w-4 mr-1" />{productionOrder ? 'Fremdbearbeitung hinzufügen' : 'Neuer Fremdbearbeitungsauftrag'}</Button>}
      </div>
    </div>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <div className="overflow-x-auto border border-border rounded-md">
      <table className="w-full text-xs"><thead className="bg-muted/30 text-muted-foreground"><tr>{['Auftrag', 'Lieferant', 'Ausgabelager', 'Rückliefertermin', 'Status', ''].map((h, i) => <th key={i} className="text-left p-3">{h}</th>)}</tr></thead>
        <tbody>{filtered.map(o => <tr key={o.id} className="border-t border-border"><td className="p-3 font-mono">{o.order_no}</td><td className="p-3">{supplierName(o.supplier_id)}</td><td className="p-3">{warehouses.find(w => w.id === o.warehouse_id)?.name}</td><td className="p-3">{o.expected_at ? new Date(`${o.expected_at}T12:00:00`).toLocaleDateString('de-DE') : '–'}</td><td className="p-3"><Badge variant="outline">{labels[o.status]}</Badge></td><td className="p-3"><Button variant="outline" size="sm" onClick={() => openDetail(o)}>{receiptsOnly ? 'Rücklieferung buchen' : 'Öffnen'}</Button></td></tr>)}
          {!filtered.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{busy ? 'Laden…' : receiptsOnly ? 'Keine offenen Rücklieferungen' : 'Keine Fremdbearbeitungsaufträge'}</td></tr>}
        </tbody></table>
    </div>
    <Dialog open={creating} onOpenChange={v => { if (!busy) setCreating(v); }}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{productionOrder ? 'Fremdbearbeitung hinzufügen' : 'Neuer Fremdbearbeitungsauftrag'}</DialogTitle><DialogDescription>{productionOrder ? `Werkstattauftrag ${productionOrder.wo_no}` : 'Auftragstyp: Fremdbearbeitung'}</DialogDescription></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3"><div className="space-y-1"><Label>{productionOrder ? 'Externer Bearbeiter' : 'Lieferant'}</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger aria-label="Lieferant"><SelectValue placeholder="Lieferant wählen" /></SelectTrigger><SelectContent>{suppliers.filter(s => (s as Supplier & { is_active?: boolean }).is_active !== false).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Ausgabelager</Label>{productionOrder ? <p className="text-sm py-2">{warehouses.find(w => w.id === productionOrder.warehouse_id)?.name}</p> : warehouseSelect(warehouseId, setWarehouseId, 'Ausgabelager')}</div><div className="space-y-1"><Label htmlFor="fb-due">Rückliefertermin</Label><Input id="fb-due" type="date" value={expected} onChange={e => setExpected(e.target.value)} /></div></div>
      <h3 className="text-sm font-medium">Materialpositionen</h3>
      {drafts.map((d, index) => <div key={d.key} className="grid grid-cols-[minmax(0,1fr)_80px_36px] gap-2"><ArticlePicker value={d.art_nr} onChange={a => setDrafts(ds => ds.map(x => x.key === d.key ? { ...x, art_nr: a?.art_nr || '' } : x))} /><Input aria-label={`Menge Position ${index + 1}`} inputMode="decimal" value={d.quantity} onChange={e => setDrafts(ds => ds.map(x => x.key === d.key ? { ...x, quantity: e.target.value } : x))} /><Button aria-label={`Position ${index + 1} entfernen`} title="Position entfernen" variant="ghost" size="icon" disabled={drafts.length === 1} onClick={() => setDrafts(ds => ds.filter(x => x.key !== d.key))}><Trash2 className="h-4 w-4" /></Button></div>)}
      <Button variant="outline" size="sm" onClick={() => setDrafts(ds => [...ds, { key: crypto.randomUUID(), art_nr: '', quantity: '1' }])}><Plus className="h-4 w-4 mr-1" />Position hinzufügen</Button>
      <Label htmlFor="fb-note">Bearbeitung / Notiz</Label><Textarea id="fb-note" value={note} onChange={e => setNote(e.target.value)} />
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCreating(false)}>Abbrechen</Button><Button disabled={busy} onClick={create}>Auftrag anlegen</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={v => { if (!v && !busy) setSelected(null); }}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Fremdbearbeitung · {selected?.order_no}</DialogTitle><DialogDescription>{selected ? supplierName(selected.supplier_id) : ''} · {selected ? labels[selected.status] : ''}</DialogDescription></DialogHeader>
      {selected?.note && <p className="text-sm">{selected.note}</p>}
      {selected?.production_order_id && <div className="text-sm space-y-1"><Button asChild variant="link" size="sm"><Link to="/admin/production">Werkstattauftrag öffnen</Link></Button><p>Material beim Bearbeiter: {warehouses.find(w => w.id === selected.external_warehouse_id)?.name || 'Noch nicht verlagert'}</p></div>}
      {detailError && <p role="alert" className="text-destructive">{detailError}</p>}
      {detailLoading ? <p>Laden…</p> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground"><tr>{['Artikel', 'Bezeichnung', 'Menge', 'Ausgegeben', 'Zurück', 'Beim Lieferanten'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{items.map(i => <tr key={i.id} className="border-t border-border"><td className="p-2 font-mono">{i.art_nr}</td><td className="p-2">{i.description}</td><td className="p-2">{fmt(i.quantity)}</td><td className="p-2">{fmt(i.qty_issued)}</td><td className="p-2">{fmt(i.qty_returned)}</td><td className="p-2">{fmt(i.qty_issued - i.qty_returned)}</td></tr>)}</tbody></table></div>}
      {selected && canIssue(selected.status) && writable && <div className="flex flex-wrap gap-2"><Button disabled={busy || detailLoading || !!detailError} onClick={issue}><PackageMinus className="h-4 w-4 mr-1" />Material ausgeben</Button><Button variant="outline" disabled={busy} onClick={cancel}>Stornieren</Button></div>}
      {selected && canReceive(selected.status) && !receiptsOnly && <Button asChild variant="outline"><Link to="/admin/purchasing?tab=receipts"><Truck className="h-4 w-4 mr-1" />Zum Wareneingang</Link></Button>}
      {selected && canReceive(selected.status) && receiptsOnly && writable && <div className="space-y-3 border-t border-border pt-3"><h3 className="text-sm font-semibold">Rücklieferung buchen</h3><div className="grid sm:grid-cols-2 gap-3"><div className="space-y-1"><Label>Ziellager</Label>{selected.production_order_id ? <p className="text-sm py-2">{warehouses.find(w => w.id === selected.warehouse_id)?.name}</p> : warehouseSelect(returnWarehouse, setReturnWarehouse, 'Ziellager')}</div><div className="space-y-1"><Label htmlFor="fb-delivery">Lieferanten-Lieferschein</Label><Input id="fb-delivery" value={deliveryNo} onChange={e => setDeliveryNo(e.target.value)} /></div></div>{items.filter(i => i.qty_issued > i.qty_returned).map(i => <div key={i.id} className="flex items-center justify-between gap-3"><Label htmlFor={`return-${i.id}`} className="min-w-0 break-words">{i.art_nr} · offen {fmt(i.qty_issued - i.qty_returned)}</Label><Input id={`return-${i.id}`} aria-label={`Rückmenge ${i.art_nr}`} inputMode="decimal" className="w-28 shrink-0" placeholder="Menge" value={returns[i.id] || ''} onChange={e => setReturns(v => ({ ...v, [i.id]: e.target.value }))} /></div>)}<Button onClick={receive} disabled={busy || detailLoading || !!detailError}><Truck className="h-4 w-4 mr-1" />Wareneingang buchen</Button></div>}
      {!!receipts.length && <div className="space-y-2 border-t border-border pt-3"><h3 className="text-sm font-semibold">Gebuchte Wareneingänge</h3>{receipts.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-mono">{r.receipt_no}</span><span>{new Date(r.received_at).toLocaleString('de-DE')}</span><span>{warehouses.find(w => w.id === r.warehouse_id)?.name} · {r.delivery_note_no || '–'}</span></div>)}</div>}
    </DialogContent></Dialog>
  </section>;
}