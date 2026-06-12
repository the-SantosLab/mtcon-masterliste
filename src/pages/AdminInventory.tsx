import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArticlePicker } from '@/components/ArticlePicker';
import { Plus, Trash2, AlertTriangle, Package, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Repeat } from 'lucide-react';
import { toast } from 'sonner';

type Warehouse = { id: string; code: string; name: string; address: string | null; is_default: boolean };
type StockRow = {
  id: string;
  art_nr: string;
  warehouse_id: string;
  quantity: number;
  min_quantity: number;
  reorder_quantity: number;
  articles?: { matchcode: string | null; bezeich_1: string | null; me: string | null } | null;
  warehouses?: { code: string; name: string } | null;
};
type Movement = {
  id: string;
  art_nr: string;
  warehouse_id: string;
  target_warehouse_id: string | null;
  movement_type: 'inbound' | 'outbound' | 'adjustment' | 'transfer';
  quantity: number;
  unit_cost: number | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  warehouses?: { code: string } | null;
};

const MOVE_LABEL: Record<Movement['movement_type'], string> = {
  inbound: 'Eingang',
  outbound: 'Ausgang',
  adjustment: 'Korrektur',
  transfer: 'Umlagerung',
};
const MOVE_ICON: Record<Movement['movement_type'], any> = {
  inbound: ArrowDownToLine,
  outbound: ArrowUpFromLine,
  adjustment: RefreshCw,
  transfer: Repeat,
};

export default function AdminInventory() {
  const { isAdmin, loading, user } = useAuth();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any).from('user_roles').select('role').eq('user_id', user.id);
      const roles = (data || []).map((r: any) => r.role);
      setRole(roles.includes('admin') ? 'admin' : roles.includes('staff') ? 'staff' : null);
    })();
  }, [user?.id]);

  if (!loading && !user) return <Navigate to="/auth" replace />;
  const canWrite = role === 'admin' || role === 'staff';

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1400px]">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Lager</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Bestände, Bewegungen und Lagerorte</p>
        </div>
        <Tabs defaultValue="stock">
          <TabsList className="bg-secondary">
            <TabsTrigger value="stock" className="text-xs">Bestände</TabsTrigger>
            <TabsTrigger value="movements" className="text-xs">Bewegungen</TabsTrigger>
            <TabsTrigger value="warehouses" className="text-xs">Lager</TabsTrigger>
          </TabsList>
          <TabsContent value="stock"><StockTab canWrite={canWrite} /></TabsContent>
          <TabsContent value="movements"><MovementsTab canWrite={canWrite} /></TabsContent>
          <TabsContent value="warehouses"><WarehousesTab isAdmin={!!isAdmin} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────
function StockTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data: whs } = await (supabase as any).from('warehouses').select('*').order('code');
    setWarehouses(whs || []);
    let q = (supabase as any).from('inventory_stock').select(
      'id, art_nr, warehouse_id, quantity, min_quantity, reorder_quantity, articles(matchcode,bezeich_1,me), warehouses(code,name)'
    );
    if (warehouseId !== 'all') q = q.eq('warehouse_id', warehouseId);
    const { data } = await q.order('art_nr').limit(500);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [warehouseId]);
  useEffect(() => {
    const ch = supabase
      .channel('inventory_stock-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter(r => {
    if (onlyLow && Number(r.quantity) > Number(r.min_quantity)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return r.art_nr.toLowerCase().includes(s)
      || (r.articles?.matchcode || '').toLowerCase().includes(s)
      || (r.articles?.bezeich_1 || '').toLowerCase().includes(s);
  });

  const totalValue = filtered.length;
  const lowCount = rows.filter(r => Number(r.quantity) <= Number(r.min_quantity)).length;

  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Bestandszeilen" value={rows.length} icon={Package} />
        <KpiTile label="Unter Mindestmenge" value={lowCount} icon={AlertTriangle} accent={lowCount > 0 ? 'warn' : undefined} />
        <KpiTile label="Lagerorte" value={warehouses.length} icon={Package} />
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Lager" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Lager</SelectItem>
            {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Suche Art.-Nr, Matchcode, Bezeichnung…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs flex-1 max-w-md"
        />
        <Button
          size="sm" variant={onlyLow ? 'default' : 'outline'}
          onClick={() => setOnlyLow(v => !v)} className="h-8 text-xs"
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />Nur unter Min
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Art.-Nr.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bezeichnung</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lager</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Bestand</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Min</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Nachbestell</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">ME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Keine Bestände — über „Bewegungen" anlegen.</td></tr>
            )}
            {filtered.map(r => {
              const low = Number(r.quantity) <= Number(r.min_quantity);
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono">{r.art_nr}</td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[280px]">
                    <div>{r.articles?.matchcode || '–'}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{r.articles?.bezeich_1 || ''}</div>
                  </td>
                  <td className="px-3 py-2">{r.warehouses?.code || '–'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${low ? 'text-amber-500' : ''}`}>{Number(r.quantity).toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.min_quantity).toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.reorder_quantity).toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.articles?.me || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canWrite && <p className="text-[10px] text-muted-foreground">Mindest- und Nachbestellmengen lassen sich pro Zeile künftig direkt editieren — aktuell über DB / Migration.</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function MovementsTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('stock_movements')
      .select('*, warehouses!stock_movements_warehouse_id_fkey(code)')
      .order('created_at', { ascending: false })
      .limit(200);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const ch = supabase.channel('stock-mov-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="space-y-3 mt-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Letzte 200 Bewegungen</p>
        {canWrite && (
          <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />Bewegung erfassen
          </Button>
        )}
      </div>
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Typ</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Art.-Nr.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lager</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Menge</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Stk-Kosten</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notiz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Noch keine Bewegungen.</td></tr>}
            {rows.map(r => {
              const Icon = MOVE_ICON[r.movement_type];
              const sign = r.movement_type === 'outbound' || r.movement_type === 'transfer'
                ? '−' : r.movement_type === 'adjustment' ? '' : '+';
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Icon className="h-3 w-3" />{MOVE_LABEL[r.movement_type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.art_nr}</td>
                  <td className="px-3 py-2">{r.warehouses?.code || '–'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{sign}{Number(r.quantity).toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.unit_cost != null ? Number(r.unit_cost).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : ''}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]">{r.note || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NewMovementDialog open={open} onClose={() => setOpen(false)} onDone={fetchData} />
    </div>
  );
}

function NewMovementDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [artNr, setArtNr] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<Movement['movement_type']>('inbound');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unitCost, setUnitCost] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any).from('warehouses').select('*').order('code');
      setWarehouses(data || []);
      const def = (data || []).find((w: Warehouse) => w.is_default) || (data || [])[0];
      if (def) setWarehouseId(def.id);
    })();
  }, [open]);

  const save = async () => {
    if (!artNr) { toast.error('Artikel wählen'); return; }
    if (!warehouseId) { toast.error('Lager wählen'); return; }
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!qty || isNaN(qty)) { toast.error('Menge ungültig'); return; }
    if (movementType === 'transfer' && !targetWarehouseId) { toast.error('Ziellager wählen'); return; }
    if (movementType === 'transfer' && targetWarehouseId === warehouseId) { toast.error('Ziel- und Quelllager identisch'); return; }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from('stock_movements').insert({
      art_nr: artNr,
      warehouse_id: warehouseId,
      target_warehouse_id: movementType === 'transfer' ? targetWarehouseId : null,
      movement_type: movementType,
      quantity: qty,
      unit_cost: unitCost ? parseFloat(unitCost.replace(',', '.')) : null,
      note: note.trim() || null,
      created_by: userData.user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Bewegung gebucht');
    setArtNr(null); setQuantity(''); setUnitCost(''); setNote(''); setMovementType('inbound');
    onDone(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Lagerbewegung erfassen</DialogTitle>
          <DialogDescription className="text-xs">Bestand wird automatisch nachgeführt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Typ</label>
            <Select value={movementType} onValueChange={(v: any) => setMovementType(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Eingang (+)</SelectItem>
                <SelectItem value="outbound">Ausgang (−)</SelectItem>
                <SelectItem value="adjustment">Korrektur (± Menge mit Vorzeichen)</SelectItem>
                <SelectItem value="transfer">Umlagerung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Artikel</label>
            <ArticlePicker
              value={artNr}
              onChange={(a) => setArtNr(a?.art_nr || null)}
              inStockOnly={movementType === 'outbound' || movementType === 'transfer'}
              inStockWarehouseId={warehouseId || null}
            />
          </div>
          <div className={movementType === 'transfer' ? 'grid grid-cols-2 gap-2' : ''}>
            <div>
              <label className="text-[11px] text-muted-foreground">{movementType === 'transfer' ? 'Von Lager' : 'Lager'}</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Lager wählen" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {movementType === 'transfer' && (
              <div>
                <label className="text-[11px] text-muted-foreground">Nach Lager</label>
                <Select value={targetWarehouseId} onValueChange={setTargetWarehouseId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Ziellager" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== warehouseId).map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Menge</label>
              <Input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="h-8 text-xs" inputMode="decimal" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Stück-Kosten (optional)</label>
              <Input value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" className="h-8 text-xs" inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Notiz</label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="z.B. Lieferschein-Nr., Vorgang…" className="text-xs min-h-[60px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">{saving ? 'Buche…' : 'Buchen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
function WarehousesTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const fetchData = async () => {
    const { data } = await (supabase as any).from('warehouses').select('*').order('code');
    setItems(data || []);
  };
  useEffect(() => { fetchData(); }, []);

  const add = async () => {
    if (!code || !name) { toast.error('Code und Name erforderlich'); return; }
    const { error } = await (supabase as any).from('warehouses').insert({
      code, name, address: address || null, is_default: items.length === 0,
    });
    if (error) { toast.error(error.message); return; }
    setCode(''); setName(''); setAddress(''); fetchData();
    toast.success('Lager angelegt');
  };
  const remove = async (id: string) => {
    if (!confirm('Lager wirklich löschen? Bestände und Bewegungen bleiben unberührt, falls verknüpft schlägt der Vorgang fehl.')) return;
    const { error } = await (supabase as any).from('warehouses').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    fetchData();
  };
  const setDefault = async (id: string) => {
    await (supabase as any).from('warehouses').update({ is_default: false }).neq('id', id);
    await (supabase as any).from('warehouses').update({ is_default: true }).eq('id', id);
    fetchData();
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Adresse</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Standard</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Keine Lager.</td></tr>}
            {items.map(w => (
              <tr key={w.id} className="hover:bg-muted/40">
                <td className="px-3 py-2 font-mono">{w.code}</td>
                <td className="px-3 py-2 text-foreground">{w.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{w.address || '–'}</td>
                <td className="px-3 py-2">
                  {w.is_default
                    ? <Badge variant="default" className="text-[10px]">Standard</Badge>
                    : isAdmin && <button onClick={() => setDefault(w.id)} className="text-[10px] text-muted-foreground hover:text-foreground underline">als Standard setzen</button>}
                </td>
                <td className="px-3 py-2">
                  {isAdmin && (
                    <button onClick={() => remove(w.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code (z.B. HQ)" className="w-28 h-8 text-xs" />
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1 h-8 text-xs" />
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresse (optional)" className="flex-1 h-8 text-xs" />
          <Button size="sm" onClick={add} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Lager</Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function KpiTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: 'warn' }) {
  return (
    <div className={`rounded-md border bg-card p-3 ${accent === 'warn' ? 'border-amber-500/30' : 'border-border'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${accent === 'warn' ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString('de-DE')}</div>
    </div>
  );
}
