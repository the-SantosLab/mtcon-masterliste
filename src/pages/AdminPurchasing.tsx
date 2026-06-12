import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArticlePicker } from '@/components/ArticlePicker';
import { Plus, Trash2, Package, Truck, ClipboardList, LayoutList } from 'lucide-react';
import { toast } from 'sonner';

type Supplier = { id: string; code: string; name: string; contact_name: string | null; email: string | null; is_active: boolean };
type Warehouse = { id: string; code: string; name: string; is_default: boolean };
type POStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';
type PO = {
  id: string; po_no: string | null; supplier_id: string; warehouse_id: string | null;
  status: POStatus; ordered_at: string | null; expected_at: string | null; notes: string | null;
  suppliers?: { name: string; code: string } | null;
  warehouses?: { code: string; name: string } | null;
};
type POItem = {
  id: string; po_id: string; position: number; art_nr: string; description: string | null;
  qty_ordered: number; qty_received: number; unit_price: number | null;
  articles?: { matchcode: string | null; bezeich_1: string | null; me: string | null } | null;
};

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Entwurf', ordered: 'Bestellt', partial: 'Teilgeliefert', received: 'Geliefert', cancelled: 'Storniert',
};
const STATUS_VARIANT: Record<POStatus, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  draft: 'outline', ordered: 'default', partial: 'secondary', received: 'secondary', cancelled: 'destructive',
};

export default function AdminPurchasing() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState('overview');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [pos, setPos] = useState<PO[]>([]);

  const [supplierDlg, setSupplierDlg] = useState(false);
  const [poDlg, setPoDlg] = useState(false);
  const [poPrefill, setPoPrefill] = useState<{ supplierId?: string; notes?: string } | undefined>();
  const [detailPO, setDetailPO] = useState<PO | null>(null);
  const [grDlg, setGrDlg] = useState(false);

  const loadAll = useCallback(async () => {
    const [s, w, p] = await Promise.all([
      (supabase as any).from('suppliers').select('*').order('name'),
      (supabase as any).from('warehouses').select('id,code,name,is_default').order('code'),
      (supabase as any).from('purchase_orders')
        .select('*, suppliers(name,code), warehouses(code,name)')
        .order('created_at', { ascending: false }),
    ]);
    setSuppliers(s.data ?? []);
    setWarehouses(w.data ?? []);
    setPos(p.data ?? []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return <AppLayout><div className="p-6 text-muted-foreground text-sm">Lädt…</div></AppLayout>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Einkauf</h1>
            <p className="text-xs text-muted-foreground">Lieferanten, Bestellungen und Wareneingang</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview"><LayoutList className="h-3.5 w-3.5 mr-1.5" />Übersicht</TabsTrigger>
            <TabsTrigger value="orders"><ClipboardList className="h-3.5 w-3.5 mr-1.5" />Bestellungen</TabsTrigger>
            <TabsTrigger value="receipts"><Truck className="h-3.5 w-3.5 mr-1.5" />Wareneingang</TabsTrigger>
            <TabsTrigger value="suppliers"><Package className="h-3.5 w-3.5 mr-1.5" />Lieferanten</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <PurchasingOverview
              onOpenPO={(p) => setDetailPO(p)}
              suppliers={suppliers}
              onCreatePO={(prefill) => { setPoPrefill(prefill); setTab('orders'); setPoDlg(true); }}
            />
          </TabsContent>


          {/* ============ BESTELLUNGEN ============ */}
          <TabsContent value="orders" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setPoDlg(true)} disabled={suppliers.length === 0}>
                <Plus className="h-4 w-4 mr-1.5" />Neue Bestellung
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">PO-Nr.</th>
                    <th className="text-left px-3 py-2">Lieferant</th>
                    <th className="text-left px-3 py-2">Lager</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Bestellt am</th>
                    <th className="text-left px-3 py-2">Erwartet</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map(p => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/20 cursor-pointer"
                        onClick={() => setDetailPO(p)}>
                      <td className="px-3 py-2 font-mono text-xs">{p.po_no}</td>
                      <td className="px-3 py-2">{p.suppliers?.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.warehouses?.code ?? '–'}</td>
                      <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.ordered_at ?? '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.expected_at ?? '–'}</td>
                    </tr>
                  ))}
                  {pos.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">Keine Bestellungen.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ============ WARENEINGANG ============ */}
          <TabsContent value="receipts" className="space-y-3">
            <p className="text-xs text-muted-foreground">Offene Bestellungen (Status bestellt / teilgeliefert). Klick öffnet die Buchung.</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">PO-Nr.</th>
                    <th className="text-left px-3 py-2">Lieferant</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Erwartet</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pos.filter(p => p.status === 'ordered' || p.status === 'partial').map(p => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{p.po_no}</td>
                      <td className="px-3 py-2">{p.suppliers?.name}</td>
                      <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">{p.expected_at ?? '–'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline"
                          onClick={() => { setDetailPO(p); setGrDlg(true); }}>
                          <Truck className="h-3.5 w-3.5 mr-1.5" />Wareneingang buchen
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pos.filter(p => p.status === 'ordered' || p.status === 'partial').length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-xs">Keine offenen Bestellungen.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ============ LIEFERANTEN ============ */}
          <TabsContent value="suppliers" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setSupplierDlg(true)}>
                <Plus className="h-4 w-4 mr-1.5" />Neuer Lieferant
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Ansprechpartner</th>
                    <th className="text-left px-3 py-2">E-Mail</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.contact_name ?? '–'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.email ?? '–'}</td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-xs">Keine Lieferanten erfasst.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <SupplierDialog open={supplierDlg} onClose={() => setSupplierDlg(false)} onCreated={loadAll} />
      <NewPODialog open={poDlg} onClose={() => { setPoDlg(false); setPoPrefill(undefined); }} suppliers={suppliers} warehouses={warehouses} onCreated={loadAll} prefill={poPrefill} />
      <PODetailDialog
        po={detailPO && !grDlg ? detailPO : null}
        onClose={() => setDetailPO(null)}
        onChanged={loadAll}
      />
      <GoodsReceiptDialog
        po={grDlg ? detailPO : null}
        warehouses={warehouses}
        onClose={() => { setGrDlg(false); setDetailPO(null); }}
        onSaved={loadAll}
      />
    </AppLayout>
  );
}

/* ===================== SUPPLIER DIALOG ===================== */
function SupplierDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code.trim() || !name.trim()) { toast.error('Code und Name erforderlich'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('suppliers').insert({
      code: code.trim(), name: name.trim(),
      contact_name: contact.trim() || null,
      email: email.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lieferant angelegt');
    setCode(''); setName(''); setContact(''); setEmail('');
    onCreated(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Neuer Lieferant</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Code</label><Input value={code} onChange={e => setCode(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Name</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Ansprechpartner</label><Input value={contact} onChange={e => setContact(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">E-Mail</label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== NEW PO DIALOG ===================== */
type DraftLine = { art_nr: string; description: string; qty: string; price: string; me?: string | null };

function NewPODialog({ open, onClose, suppliers, warehouses, onCreated }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]; warehouses: Warehouse[]; onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [orderedAt, setOrderedAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [expectedAt, setExpectedAt] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSupplierId(''); setWarehouseId(warehouses.find(w => w.is_default)?.id ?? warehouses[0]?.id ?? '');
      setOrderedAt(new Date().toISOString().slice(0, 10)); setExpectedAt(''); setNotes(''); setLines([]);
    }
  }, [open, warehouses]);

  const addLine = () => setLines(l => [...l, { art_nr: '', description: '', qty: '', price: '' }]);
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines(l => l.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!supplierId) { toast.error('Lieferant wählen'); return; }
    if (lines.length === 0) { toast.error('Mindestens eine Position'); return; }
    const validLines = lines.map(l => ({ ...l, qtyNum: Number(l.qty), priceNum: l.price ? Number(l.price) : null }));
    if (validLines.some(l => !l.art_nr || !l.qtyNum || l.qtyNum <= 0)) { toast.error('Artikel und Menge je Position'); return; }

    setSaving(true);
    const { data: po, error: poErr } = await (supabase as any).from('purchase_orders').insert({
      supplier_id: supplierId,
      warehouse_id: warehouseId || null,
      status: 'ordered',
      ordered_at: orderedAt || null,
      expected_at: expectedAt || null,
      notes: notes.trim() || null,
    }).select('id').single();
    if (poErr || !po) { setSaving(false); toast.error(poErr?.message || 'Fehler'); return; }

    const rows = validLines.map((l, i) => ({
      po_id: po.id, position: (i + 1) * 10,
      art_nr: l.art_nr, description: l.description || null,
      qty_ordered: l.qtyNum, unit_price: l.priceNum,
    }));
    const { error: itemErr } = await (supabase as any).from('purchase_order_items').insert(rows);
    setSaving(false);
    if (itemErr) { toast.error(itemErr.message); return; }
    toast.success('Bestellung angelegt');
    onCreated(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Neue Bestellung</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Lieferant</label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ziel-Lager</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bestelldatum</label>
              <Input type="date" value={orderedAt} onChange={e => setOrderedAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Erwartet am</label>
              <Input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notizen</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Positionen</div>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Position</Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 rounded border border-border">
                <div className="col-span-5">
                  <label className="text-[10px] text-muted-foreground">Artikel</label>
                  <ArticlePicker value={l.art_nr || null}
                    onChange={a => updateLine(i, {
                      art_nr: a?.art_nr ?? '',
                      description: l.description || a?.bezeich_1 || a?.matchcode || '',
                      me: a?.me ?? null,
                    })} />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-muted-foreground">Bezeichnung</label>
                  <Input value={l.description} onChange={e => updateLine(i, { description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Menge {l.me && `(${l.me})`}</label>
                  <Input type="number" step="0.001" value={l.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] text-muted-foreground">Preis</label>
                  <Input type="number" step="0.0001" value={l.price} onChange={e => updateLine(i, { price: e.target.value })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded">
                Noch keine Positionen.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== PO DETAIL DIALOG ===================== */
function PODetailDialog({ po, onClose, onChanged }: { po: PO | null; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<POItem[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    if (!po) return;
    (async () => {
      const [i, r] = await Promise.all([
        (supabase as any).from('purchase_order_items')
          .select('*, articles(matchcode,bezeich_1,me)')
          .eq('po_id', po.id).order('position'),
        (supabase as any).from('goods_receipts')
          .select('id, gr_no, received_at, delivery_note_no, warehouses(code,name)')
          .eq('po_id', po.id).order('received_at', { ascending: false }),
      ]);
      setItems(i.data ?? []);
      setReceipts(r.data ?? []);
    })();
  }, [po]);

  const cancelPO = async () => {
    if (!po) return;
    if (!confirm('Bestellung stornieren?')) return;
    const { error } = await (supabase as any).from('purchase_orders').update({ status: 'cancelled' }).eq('id', po.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Storniert'); onChanged(); onClose();
  };

  if (!po) return null;
  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-sm">{po.po_no}</span>
            <Badge variant={STATUS_VARIANT[po.status]}>{STATUS_LABEL[po.status]}</Badge>
          </DialogTitle>
          <DialogDescription>{po.suppliers?.name} · Lager {po.warehouses?.code ?? '–'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Positionen</div>
            <div className="rounded border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5">Pos</th>
                    <th className="text-left px-2 py-1.5">Artikel</th>
                    <th className="text-left px-2 py-1.5">Bezeichnung</th>
                    <th className="text-right px-2 py-1.5">Best.</th>
                    <th className="text-right px-2 py-1.5">Geliefert</th>
                    <th className="text-right px-2 py-1.5">Offen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const open = Number(it.qty_ordered) - Number(it.qty_received);
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground">{it.position}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{it.art_nr}</td>
                        <td className="px-2 py-1.5">{it.description || it.articles?.bezeich_1 || it.articles?.matchcode}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(it.qty_ordered)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(it.qty_received)}</td>
                        <td className={'px-2 py-1.5 text-right tabular-nums ' + (open > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>{open}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {receipts.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Wareneingänge</div>
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1.5">WE-Nr.</th>
                      <th className="text-left px-2 py-1.5">Datum</th>
                      <th className="text-left px-2 py-1.5">Lager</th>
                      <th className="text-left px-2 py-1.5">Lieferschein</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r: any) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-2 py-1.5 font-mono text-xs">{r.gr_no}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{new Date(r.received_at).toLocaleString('de-DE')}</td>
                        <td className="px-2 py-1.5">{r.warehouses?.code}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.delivery_note_no ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {po.notes && <div className="text-sm text-muted-foreground"><span className="text-xs uppercase tracking-wide">Notizen:</span> {po.notes}</div>}
        </div>
        <DialogFooter>
          {po.status !== 'cancelled' && po.status !== 'received' && (
            <Button variant="destructive" onClick={cancelPO}>Stornieren</Button>
          )}
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== GOODS RECEIPT DIALOG ===================== */
function GoodsReceiptDialog({ po, warehouses, onClose, onSaved }: {
  po: PO | null; warehouses: Warehouse[]; onClose: () => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<POItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [deliveryNo, setDeliveryNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!po) return;
    setWarehouseId(po.warehouse_id ?? warehouses.find(w => w.is_default)?.id ?? warehouses[0]?.id ?? '');
    setDeliveryNo(''); setNotes(''); setQtys({});
    (async () => {
      const { data } = await (supabase as any).from('purchase_order_items')
        .select('*, articles(matchcode,bezeich_1,me)')
        .eq('po_id', po.id).order('position');
      const all = (data ?? []) as POItem[];
      setItems(all);
      // Prefill open quantities
      const init: Record<string, string> = {};
      all.forEach(it => {
        const open = Number(it.qty_ordered) - Number(it.qty_received);
        if (open > 0) init[it.id] = String(open);
      });
      setQtys(init);
    })();
  }, [po, warehouses]);

  const fillRemaining = () => {
    const init: Record<string, string> = {};
    items.forEach(it => {
      const open = Number(it.qty_ordered) - Number(it.qty_received);
      if (open > 0) init[it.id] = String(open);
    });
    setQtys(init);
  };

  const save = async () => {
    if (!po) return;
    if (!warehouseId) { toast.error('Lager wählen'); return; }
    const toBook = items
      .map(it => ({ it, qty: Number(qtys[it.id] || 0) }))
      .filter(x => x.qty > 0);
    if (toBook.length === 0) { toast.error('Keine Mengen erfasst'); return; }
    for (const x of toBook) {
      const open = Number(x.it.qty_ordered) - Number(x.it.qty_received);
      if (x.qty > open) { toast.error(`Position ${x.it.position}: Menge übersteigt Offen (${open})`); return; }
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: gr, error: grErr } = await (supabase as any).from('goods_receipts').insert({
      po_id: po.id,
      warehouse_id: warehouseId,
      delivery_note_no: deliveryNo.trim() || null,
      notes: notes.trim() || null,
      received_by: user?.id ?? null,
    }).select('id, gr_no').single();
    if (grErr || !gr) { setSaving(false); toast.error(grErr?.message || 'Fehler'); return; }

    const rows = toBook.map(x => ({ gr_id: gr.id, po_item_id: x.it.id, qty_received: x.qty }));
    const { error: itemErr } = await (supabase as any).from('goods_receipt_items').insert(rows);
    setSaving(false);
    if (itemErr) {
      // Rollback GR if items fail
      await (supabase as any).from('goods_receipts').delete().eq('id', gr.id);
      toast.error(itemErr.message); return;
    }
    toast.success(`Wareneingang ${gr.gr_no} gebucht`);
    onSaved(); onClose();
  };

  const totalOpen = useMemo(() => items.reduce((s, it) => s + (Number(it.qty_ordered) - Number(it.qty_received)), 0), [items]);

  if (!po) return null;
  return (
    <Dialog open={!!po} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Wareneingang · <span className="font-mono text-sm">{po.po_no}</span></DialogTitle>
          <DialogDescription>{po.suppliers?.name} · Offen gesamt: {totalOpen}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ziel-Lager</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lieferschein-Nr.</label>
              <Input value={deliveryNo} onChange={e => setDeliveryNo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notizen</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Positionen</div>
            <Button size="sm" variant="outline" onClick={fillRemaining}>Restmenge vorbelegen</Button>
          </div>

          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Pos</th>
                  <th className="text-left px-2 py-1.5">Artikel</th>
                  <th className="text-left px-2 py-1.5">Bezeichnung</th>
                  <th className="text-right px-2 py-1.5">Best.</th>
                  <th className="text-right px-2 py-1.5">Geliefert</th>
                  <th className="text-right px-2 py-1.5">Offen</th>
                  <th className="text-right px-2 py-1.5 w-32">Jetzt buchen</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const open = Number(it.qty_ordered) - Number(it.qty_received);
                  return (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-2 py-1.5 text-muted-foreground">{it.position}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{it.art_nr}</td>
                      <td className="px-2 py-1.5">{it.description || it.articles?.bezeich_1 || it.articles?.matchcode}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Number(it.qty_ordered)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{Number(it.qty_received)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{open}</td>
                      <td className="px-2 py-1">
                        <Input type="number" step="0.001" min="0" max={open}
                          disabled={open <= 0}
                          value={qtys[it.id] ?? ''}
                          onChange={e => setQtys(q => ({ ...q, [it.id]: e.target.value }))}
                          className="h-7 text-right" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Wareneingang buchen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== PURCHASING OVERVIEW ===================== */
type OverviewItem = {
  id: string;
  po_id: string;
  position: number;
  art_nr: string;
  description: string | null;
  qty_ordered: number;
  qty_received: number;
  articles?: { matchcode: string | null; bezeich_1: string | null; me: string | null } | null;
  purchase_orders: {
    id: string; po_no: string | null; status: POStatus;
    ordered_at: string | null; expected_at: string | null;
    warehouse_id: string | null; supplier_id: string; notes: string | null;
    suppliers?: { name: string; code: string } | null;
    warehouses?: { code: string; name: string } | null;
  };
};

function PurchasingOverview({ onOpenPO, onCreatePO }: { onOpenPO: (po: PO) => void; onCreatePO: () => void }) {
  const [rows, setRows] = useState<OverviewItem[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await (supabase as any)
      .from('purchase_order_items')
      .select('*, articles(matchcode,bezeich_1,me), purchase_orders!inner(id,po_no,status,ordered_at,expected_at,warehouse_id,supplier_id,notes,suppliers(name,code),warehouses(code,name))')
      .order('position');
    if (error) setError(error.message ?? 'Daten konnten nicht geladen werden.');
    else setRows((data ?? []) as OverviewItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => {
      const open = Number(r.qty_ordered) - Number(r.qty_received);
      if (filter === 'open' && (open <= 0 || r.purchase_orders.status === 'cancelled')) return false;
      if (!ql) return true;
      return (
        r.purchase_orders.po_no?.toLowerCase().includes(ql) ||
        r.art_nr.toLowerCase().includes(ql) ||
        (r.description || '').toLowerCase().includes(ql) ||
        (r.articles?.bezeich_1 || '').toLowerCase().includes(ql) ||
        (r.purchase_orders.suppliers?.name || '').toLowerCase().includes(ql)
      );
    });
  }, [rows, filter, q]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueClass = (d: string | null, open: number) => {
    if (!d || open <= 0) return 'text-muted-foreground';
    const dt = new Date(d);
    if (dt < today) return 'text-destructive font-medium';
    const days = (dt.getTime() - today.getTime()) / 86400000;
    if (days <= 7) return 'text-amber-500 dark:text-amber-400 font-medium';
    return 'text-foreground';
  };

  const totals = useMemo(() => filtered.reduce((acc, r) => {
    acc.ordered += Number(r.qty_ordered);
    acc.received += Number(r.qty_received);
    acc.open += Math.max(0, Number(r.qty_ordered) - Number(r.qty_received));
    return acc;
  }, { ordered: 0, received: 0, open: 0 }), [filtered]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: 'open' | 'all') => setFilter(v)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Nur offene Positionen</SelectItem>
              <SelectItem value="all">Alle Positionen</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="PO, Artikel, Lieferant…" value={q} onChange={e => setQ(e.target.value)} className="h-8 text-xs w-64" />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Σ Bestellt {totals.ordered} · Geliefert {totals.received} · Offen <span className="text-foreground font-medium">{totals.open}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">PO</th>
              <th className="text-left px-3 py-2">Lieferant</th>
              <th className="text-left px-3 py-2">Pos</th>
              <th className="text-left px-3 py-2">Artikel</th>
              <th className="text-left px-3 py-2">Bezeichnung</th>
              <th className="text-right px-3 py-2">Bestellt</th>
              <th className="text-right px-3 py-2">Geliefert</th>
              <th className="text-right px-3 py-2">Rest</th>
              <th className="text-left px-3 py-2">Bestellt am</th>
              <th className="text-left px-3 py-2">Liefertermin</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t border-border">
                {Array.from({ length: 11 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><div className="h-3 rounded bg-muted/40 animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!loading && error && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center">
                  <div className="text-xs text-destructive mb-2">{error}</div>
                  <Button size="sm" variant="outline" onClick={load} className="h-7 text-xs">Erneut versuchen</Button>
                </td>
              </tr>
            )}
            {!loading && !error && filtered.map(r => {
              const open = Number(r.qty_ordered) - Number(r.qty_received);
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => onOpenPO({
                      id: r.purchase_orders.id,
                      po_no: r.purchase_orders.po_no,
                      supplier_id: r.purchase_orders.supplier_id,
                      warehouse_id: r.purchase_orders.warehouse_id,
                      status: r.purchase_orders.status,
                      ordered_at: r.purchase_orders.ordered_at,
                      expected_at: r.purchase_orders.expected_at,
                      notes: r.purchase_orders.notes,
                      suppliers: r.purchase_orders.suppliers,
                      warehouses: r.purchase_orders.warehouses,
                    })}>
                  <td className="px-3 py-2 font-mono text-xs">{r.purchase_orders.po_no}</td>
                  <td className="px-3 py-2">{r.purchase_orders.suppliers?.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.position}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.art_nr}</td>
                  <td className="px-3 py-2">{r.description || r.articles?.bezeich_1 || r.articles?.matchcode}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.qty_ordered)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.qty_received)}</td>
                  <td className={'px-3 py-2 text-right tabular-nums ' + (open > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>{open}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.purchase_orders.ordered_at ?? '–'}</td>
                  <td className={'px-3 py-2 text-xs ' + dueClass(r.purchase_orders.expected_at, open)}>
                    {r.purchase_orders.expected_at ?? '–'}
                  </td>
                  <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[r.purchase_orders.status]}>{STATUS_LABEL[r.purchase_orders.status]}</Badge></td>
                </tr>
              );
            })}
            {!loading && !error && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-10 text-center">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <LayoutList className="h-8 w-8 text-muted-foreground/50" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Noch keine Bestellungen vorhanden</div>
                      <div className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Sobald eine Bestellung angelegt wurde, erscheinen ihre Positionen hier mit Bestellt-, Geliefert- und Restmengen.
                      </div>
                    </div>
                    <Button size="sm" onClick={onCreatePO} className="h-8 text-xs">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Neue Bestellung anlegen
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {q ? 'Keine Treffer für die aktuelle Suche.' : 'Keine offenen Positionen – alle Bestellungen sind vollständig geliefert.'}
                  </div>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>

  );
}
