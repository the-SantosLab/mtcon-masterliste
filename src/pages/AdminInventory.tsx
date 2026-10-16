import { ProcurementHeader } from '@/components/erp/ProcurementHeader';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { useEffect, useMemo, useState } from 'react';
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
import { Plus, Trash2, AlertTriangle, Package, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Repeat, Undo2, Link as LinkIcon, MapPin } from 'lucide-react';
import { StorageLocationsPanel } from './AdminStorageLocations';
import { LotsPanel } from './AdminLots';
import { SperrlagerPanel } from './AdminSperrlager';

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
  order_id: string | null;
  project_id: string | null;
  case_id: string | null;
  transfer_id: string | null;
  lot_no: string | null;
  serial_no: string | null;
  warehouses?: { code: string } | null;
};
type Reservation = {
  id: string;
  art_nr: string;
  warehouse_id: string;
  quantity: number;
  order_id: string | null;
  project_id: string | null;
  case_id: string | null;
  note: string | null;
  status: 'open' | 'released' | 'consumed';
  expires_at: string | null;
  created_at: string;
  warehouses?: { code: string } | null;
  articles?: { matchcode: string | null; bezeich_1: string | null } | null;
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
      <div className="fulfillment-page procurement-page">
        <ProcurementHeader title="Lager" subtitle="Bestände · Bewegungen · Reservierungen · Lagerorte" />
        <Tabs defaultValue="stock">
          <TabsList className="bg-secondary">
            <TabsTrigger value="stock" className="text-xs">Bestände</TabsTrigger>
            <TabsTrigger value="movements" className="text-xs">Bewegungen</TabsTrigger>
            <TabsTrigger value="reservations" className="text-xs">Reservierungen</TabsTrigger>
            <TabsTrigger value="warehouses" className="text-xs">Lager</TabsTrigger>
            <TabsTrigger value="locations" className="text-xs">Lagerplätze</TabsTrigger>
            <TabsTrigger value="lots" className="text-xs">Chargen</TabsTrigger>
            <TabsTrigger value="sperrlager" className="text-xs">Sperrlager</TabsTrigger>
          </TabsList>
          <TabsContent value="stock"><StockTab canWrite={canWrite} /></TabsContent>
          <TabsContent value="movements"><MovementsTab canWrite={canWrite} isAdmin={!!isAdmin} /></TabsContent>
          <TabsContent value="reservations"><ReservationsTab canWrite={canWrite} /></TabsContent>
          <TabsContent value="warehouses"><WarehousesTab isAdmin={!!isAdmin} /></TabsContent>
          <TabsContent value="locations"><StorageLocationsPanel /></TabsContent>
          <TabsContent value="lots"><LotsPanel /></TabsContent>
          <TabsContent value="sperrlager"><SperrlagerPanel /></TabsContent>
        </Tabs>

      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────
function StockTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<(StockRow & { reserved?: number; available?: number })[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [colFilters, setColFilters] = useState<{ art: string; bez: string; lager: string; me: string }>({ art: '', bez: '', lager: '', me: '' });

  const fetchData = async () => {
    setLoading(true);
    const { data: whs } = await (supabase as any).from('warehouses').select('*').order('code');
    setWarehouses(whs || []);
    const PAGE = 1000;
    let from = 0;
    let data: any[] = [];
    while (true) {
      let q = (supabase as any).from('inventory_stock').select(
        'id, art_nr, warehouse_id, quantity, min_quantity, reorder_quantity, articles(matchcode,bezeich_1,me), warehouses(code,name)'
      );
      if (warehouseId !== 'all') q = q.eq('warehouse_id', warehouseId);
      const { data: page } = await q.order('art_nr').range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      data = data.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
    }

    // Reservierungen pro Artikel/Lager aggregieren
    const { data: res } = await (supabase as any)
      .from('stock_reservations')
      .select('art_nr,warehouse_id,quantity')
      .eq('status', 'open');
    const resMap = new Map<string, number>();
    (res || []).forEach((r: any) => {
      const k = `${r.art_nr}|${r.warehouse_id}`;
      resMap.set(k, (resMap.get(k) || 0) + Number(r.quantity));
    });

    const enriched = (data || []).map((r: any) => {
      const reserved = resMap.get(`${r.art_nr}|${r.warehouse_id}`) || 0;
      return { ...r, reserved, available: Number(r.quantity) - reserved };
    });
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [warehouseId]);
  useEffect(() => {
    const ch = supabase
      .channel('inventory_stock-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_reservations' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter(r => {
    if (onlyLow && Number(r.quantity) > Number(r.min_quantity)) return false;
    const s = search.toLowerCase();
    if (s) {
      const inGlobal = r.art_nr.toLowerCase().includes(s)
        || (r.articles?.matchcode || '').toLowerCase().includes(s)
        || (r.articles?.bezeich_1 || '').toLowerCase().includes(s);
      if (!inGlobal) return false;
    }
    if (colFilters.art && !r.art_nr.toLowerCase().includes(colFilters.art.toLowerCase())) return false;
    if (colFilters.bez) {
      const bz = colFilters.bez.toLowerCase();
      const match = (r.articles?.matchcode || '').toLowerCase().includes(bz)
        || (r.articles?.bezeich_1 || '').toLowerCase().includes(bz);
      if (!match) return false;
    }
    if (colFilters.lager && !(r.warehouses?.code || '').toLowerCase().includes(colFilters.lager.toLowerCase())) return false;
    if (colFilters.me && !(r.articles?.me || '').toLowerCase().includes(colFilters.me.toLowerCase())) return false;
    return true;
  });

  const lowCount = rows.filter(r => Number(r.quantity) <= Number(r.min_quantity)).length;
  const hasColFilter = !!(colFilters.art || colFilters.bez || colFilters.lager || colFilters.me);

  return (
    <div className="space-y-3 mt-3">
      <FulfillmentMetrics loading={loading} metrics={[
        { label: 'Bestandszeilen', value: rows.length },
        { label: 'Unter Mindestmenge', value: lowCount, tone: lowCount > 0 ? 'overdue' : 'done' },
        { label: 'Lager', value: warehouses.length },
      ]} />

      <div className="flex gap-2 items-end flex-wrap">
        <div className="min-w-[260px] flex-1 max-w-md">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Artikel</label>
          <ArticlePicker
            value={colFilters.art || null}
            onChange={(a) => setColFilters(f => ({ ...f, art: a?.art_nr || '' }))}
            placeholder="Alle Artikel"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lager</label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Lager" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Lager</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Suche Matchcode / Bezeichnung…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs flex-1 max-w-xs"
        />
        <Button
          size="sm" variant={onlyLow ? 'default' : 'outline'}
          onClick={() => setOnlyLow(v => !v)} className="h-8 text-xs"
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />Nur unter Min
        </Button>
        {hasColFilter && (
          <Button size="sm" variant="ghost" onClick={() => setColFilters({ art: '', bez: '', lager: '', me: '' })} className="h-8 text-xs">
            Spaltenfilter zurücksetzen
          </Button>
        )}
      </div>

      {/* Desktop-Tabelle mit fixiertem Header und Spaltenfiltern */}
      <div className="hidden md:block rounded-md border border-border bg-card overflow-hidden">
        <div className="max-h-[calc(100vh-340px)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground bg-card">Art.-Nr.</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground bg-card">Bezeichnung</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground bg-card">Lager</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground bg-card">Bestand</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground bg-card">Reserviert</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground bg-card">Verfügbar</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground bg-card">Min</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground bg-card">ME</th>
              </tr>
              <tr className="border-b border-border">
                <th className="px-2 py-1 bg-card">
                  <Input value={colFilters.art} onChange={e => setColFilters(f => ({ ...f, art: e.target.value }))} placeholder="Filter…" className="h-6 text-[11px]" />
                </th>
                <th className="px-2 py-1 bg-card">
                  <Input value={colFilters.bez} onChange={e => setColFilters(f => ({ ...f, bez: e.target.value }))} placeholder="Filter…" className="h-6 text-[11px]" />
                </th>
                <th className="px-2 py-1 bg-card">
                  <Input value={colFilters.lager} onChange={e => setColFilters(f => ({ ...f, lager: e.target.value }))} placeholder="Filter…" className="h-6 text-[11px]" />
                </th>
                <th className="px-2 py-1 bg-card" />
                <th className="px-2 py-1 bg-card" />
                <th className="px-2 py-1 bg-card" />
                <th className="px-2 py-1 bg-card" />
                <th className="px-2 py-1 bg-card">
                  <Input value={colFilters.me} onChange={e => setColFilters(f => ({ ...f, me: e.target.value }))} placeholder="Filter…" className="h-6 text-[11px]" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Keine Bestände — über „Bewegungen" anlegen.</td></tr>
              )}
              {filtered.map(r => {
                const low = Number(r.quantity) <= Number(r.min_quantity);
                const avail = Number(r.available ?? r.quantity);
                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono">{r.art_nr}</td>
                    <td className="px-3 py-2 text-foreground truncate max-w-[280px]">
                      <div>{r.articles?.matchcode || '–'}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{r.articles?.bezeich_1 || ''}</div>
                    </td>
                    <td className="px-3 py-2">{r.warehouses?.code || '–'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${low ? 'text-amber-500' : ''}`}>{Number(r.quantity).toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.reserved ? Number(r.reserved).toLocaleString('de-DE') : '–'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${avail <= 0 ? 'text-destructive' : 'text-foreground'}`}>{avail.toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.min_quantity).toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.articles?.me || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


      {/* Mobile Karten */}
      <div className="md:hidden space-y-2">
        {loading && <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">Lade…</div>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">Keine Bestände — über „Bewegungen" anlegen.</div>
        )}
        {filtered.map(r => {
          const low = Number(r.quantity) <= Number(r.min_quantity);
          const avail = Number(r.available ?? r.quantity);
          return (
            <div key={r.id} className="rounded-md border border-border bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-muted-foreground">{r.art_nr}</div>
                  <div className="text-foreground truncate">{r.articles?.matchcode || '–'}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{r.articles?.bezeich_1 || ''}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-muted-foreground">Lager</div>
                  <div className="font-medium">{r.warehouses?.code || '–'}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
                <div>
                  <div className="text-[10px] text-muted-foreground">Bestand</div>
                  <div className={`tabular-nums font-medium ${low ? 'text-amber-500' : ''}`}>{Number(r.quantity).toLocaleString('de-DE')}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Reserv.</div>
                  <div className="tabular-nums text-muted-foreground">{r.reserved ? Number(r.reserved).toLocaleString('de-DE') : '–'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Verfügb.</div>
                  <div className={`tabular-nums ${avail <= 0 ? 'text-destructive' : 'text-foreground'}`}>{avail.toLocaleString('de-DE')}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Min · ME</div>
                  <div className="tabular-nums text-muted-foreground">{Number(r.min_quantity).toLocaleString('de-DE')} {r.articles?.me || ''}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canWrite && <p className="text-[10px] text-muted-foreground">Verfügbar = Bestand − offene Reservierungen.</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function MovementsTab({ canWrite, isAdmin }: { canWrite: boolean; isAdmin: boolean }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filterArtNr, setFilterArtNr] = useState<string | null>(null);
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const fetchData = async () => {
    setLoading(true);
    let q = (supabase as any)
      .from('stock_movements')
      .select('*, warehouses!stock_movements_warehouse_id_fkey(code)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (filterArtNr) q = q.eq('art_nr', filterArtNr);
    if (filterWarehouseId !== 'all') q = q.eq('warehouse_id', filterWarehouseId);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [filterArtNr, filterWarehouseId]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('warehouses').select('*').order('code');
      setWarehouses(data || []);
    })();
  }, []);
  useEffect(() => {
    const ch = supabase.channel('stock-mov-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterArtNr, filterWarehouseId]);

  const stornoTransfer = async (transferId: string) => {
    if (!confirm('Umlagerung stornieren? Beide gepaarten Buchungen werden gelöscht und der Bestand zurückgesetzt.')) return;
    // Bestand zurückrechnen, dann Zeilen entfernen
    const pair = rows.filter(r => r.transfer_id === transferId);
    if (pair.length === 0) { toast.error('Paar nicht gefunden'); return; }
    for (const m of pair) {
      const delta = m.movement_type === 'inbound' ? -Number(m.quantity) : Number(m.quantity);
      await (supabase as any).rpc('exec', {}); // no-op placeholder
      // Direkt update inventory_stock
      const { data: cur } = await (supabase as any).from('inventory_stock').select('id,quantity').eq('art_nr', m.art_nr).eq('warehouse_id', m.warehouse_id).maybeSingle();
      if (cur) {
        await (supabase as any).from('inventory_stock').update({ quantity: Number(cur.quantity) + delta }).eq('id', cur.id);
      }
    }
    const { error } = await (supabase as any).from('stock_movements').delete().eq('transfer_id', transferId);
    if (error) { toast.error(error.message); return; }
    toast.success('Umlagerung storniert');
    fetchData();
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="flex justify-between items-end gap-2 flex-wrap">
        <div className="flex gap-2 items-end flex-wrap flex-1">
          <div className="min-w-[260px] flex-1 max-w-md">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Artikel</label>
            <ArticlePicker value={filterArtNr} onChange={(a) => setFilterArtNr(a?.art_nr || null)} placeholder="Alle Artikel" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lager</label>
            <Select value={filterWarehouseId} onValueChange={setFilterWarehouseId}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lager</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(filterArtNr || filterWarehouseId !== 'all') && (
            <Button size="sm" variant="ghost" onClick={() => { setFilterArtNr(null); setFilterWarehouseId('all'); }} className="h-8 text-xs">Filter zurücksetzen</Button>
          )}
          <p className="text-xs text-muted-foreground ml-auto self-center">{rows.length} {rows.length === 1 ? 'Bewegung' : 'Bewegungen'}</p>
        </div>
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
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Verknüpfung</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Charge / Serie</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notiz</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Noch keine Bewegungen.</td></tr>}
            {rows.map(r => {
              const Icon = MOVE_ICON[r.movement_type];
              const sign = r.movement_type === 'outbound' || r.movement_type === 'transfer'
                ? '−' : r.movement_type === 'adjustment' ? '' : '+';
              const links: string[] = [];
              if (r.order_id) links.push('Bestellung');
              if (r.project_id) links.push('Projekt');
              if (r.case_id) links.push('Vorgang');
              if (r.transfer_id) links.push('Transfer');
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
                  <td className="px-3 py-2">
                    {links.length === 0 ? <span className="text-muted-foreground">–</span> : (
                      <div className="flex gap-1 flex-wrap">
                        {links.map(l => <Badge key={l} variant="secondary" className="text-[10px] gap-1"><LinkIcon className="h-2.5 w-2.5" />{l}</Badge>)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-[10px] font-mono">
                    {r.lot_no ? `L:${r.lot_no}` : ''} {r.serial_no ? `S:${r.serial_no}` : ''}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[260px]">{r.note || ''}</td>
                  <td className="px-3 py-2">
                    {isAdmin && r.transfer_id && r.movement_type === 'transfer' && (
                      <button onClick={() => stornoTransfer(r.transfer_id!)} title="Umlagerung stornieren" className="text-muted-foreground hover:text-destructive">
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
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

// ─────────────────────────────────────────────────────────────
function useEntityOptions() {
  const [orders, setOrders] = useState<{ id: string; label: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; label: string }[]>([]);
  const [cases, setCases] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [o, p, c] = await Promise.all([
        (supabase as any).from('orders').select('id,order_no,status').order('created_at', { ascending: false }).limit(100),
        (supabase as any).from('projects').select('id,name,status').order('created_at', { ascending: false }).limit(100),
        (supabase as any).from('cases').select('id,case_no,project_name').order('created_at', { ascending: false }).limit(100),
      ]);
      setOrders((o.data || []).map((r: any) => ({ id: r.id, label: `${r.order_no || r.id.slice(0,8)}${r.status ? ' · ' + r.status : ''}` })));
      setProjects((p.data || []).map((r: any) => ({ id: r.id, label: r.name || r.id.slice(0,8) })));
      setCases((c.data || []).map((r: any) => ({ id: r.id, label: `${r.case_no || r.id.slice(0,8)}${r.project_name ? ' · ' + r.project_name : ''}` })));
    })();
  }, []);

  return { orders, projects, cases };
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
  const [orderId, setOrderId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [caseId, setCaseId] = useState<string>('');
  const [lotNo, setLotNo] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [saving, setSaving] = useState(false);
  const { orders, projects, cases } = useEntityOptions();

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any).from('warehouses').select('*').order('code');
      setWarehouses(data || []);
      const def = (data || []).find((w: Warehouse) => w.is_default) || (data || [])[0];
      if (def) setWarehouseId(def.id);
    })();
  }, [open]);

  const reset = () => {
    setArtNr(null); setQuantity(''); setUnitCost(''); setNote(''); setMovementType('inbound');
    setOrderId(''); setProjectId(''); setCaseId(''); setLotNo(''); setSerialNo('');
  };

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
      order_id: orderId || null,
      project_id: projectId || null,
      case_id: caseId || null,
      lot_no: lotNo.trim() || null,
      serial_no: serialNo.trim() || null,
      created_by: userData.user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Bewegung gebucht');
    reset();
    onDone(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="rounded-md border border-border bg-secondary/30 p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verknüpfung (optional)</div>
            <div className="grid grid-cols-3 gap-2">
              <EntitySelect label="Bestellung" value={orderId} onChange={setOrderId} options={orders} />
              <EntitySelect label="Projekt" value={projectId} onChange={setProjectId} options={projects} />
              <EntitySelect label="Vorgang" value={caseId} onChange={setCaseId} options={cases} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Charge (optional)</label>
              <Input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="z.B. LOT-2026-001" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Seriennr. (optional)</label>
              <Input value={serialNo} onChange={e => setSerialNo(e.target.value)} placeholder="z.B. SN-12345" className="h-8 text-xs" />
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

function EntitySelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent className="max-h-[280px]">
          <SelectItem value="__none__">— keine —</SelectItem>
          {options.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function ReservationsTab({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [filterArtNr, setFilterArtNr] = useState<string | null>(null);
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const fetchData = async () => {
    setLoading(true);
    let q = (supabase as any)
      .from('stock_reservations')
      .select('*, warehouses(code), articles(matchcode,bezeich_1)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (statusFilter === 'open') q = q.eq('status', 'open');
    if (filterArtNr) q = q.eq('art_nr', filterArtNr);
    if (filterWarehouseId !== 'all') q = q.eq('warehouse_id', filterWarehouseId);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [statusFilter, filterArtNr, filterWarehouseId]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('warehouses').select('*').order('code');
      setWarehouses(data || []);
    })();
  }, []);
  useEffect(() => {
    const ch = supabase.channel('stock-res-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_reservations' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, filterArtNr, filterWarehouseId]);

  const setStatus = async (id: string, status: Reservation['status']) => {
    const { error } = await (supabase as any).from('stock_reservations').update({ status }).eq('id', id);
    if (error) toast.error(error.message);
    else toast.success(status === 'released' ? 'Freigegeben' : status === 'consumed' ? 'Als verbraucht markiert' : 'Aktualisiert');
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="flex justify-between items-end gap-2 flex-wrap">
        <div className="flex gap-2 items-end flex-wrap flex-1">
          <div className="min-w-[260px] flex-1 max-w-md">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Artikel</label>
            <ArticlePicker value={filterArtNr} onChange={(a) => setFilterArtNr(a?.art_nr || null)} placeholder="Alle Artikel" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lager</label>
            <Select value={filterWarehouseId} onValueChange={setFilterWarehouseId}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lager</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Nur offen</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filterArtNr || filterWarehouseId !== 'all') && (
            <Button size="sm" variant="ghost" onClick={() => { setFilterArtNr(null); setFilterWarehouseId('all'); }} className="h-8 text-xs">Filter zurücksetzen</Button>
          )}
          <p className="text-xs text-muted-foreground ml-auto self-center">{rows.length} {rows.length === 1 ? 'Reservierung' : 'Reservierungen'}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />Reservierung
          </Button>
        )}
      </div>
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Art.-Nr.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bezeichnung</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lager</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Menge</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Verknüpfung</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ablauf</th>
              <th className="px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Lade…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Keine Reservierungen.</td></tr>}
            {rows.map(r => {
              const links: string[] = [];
              if (r.order_id) links.push('Bestellung');
              if (r.project_id) links.push('Projekt');
              if (r.case_id) links.push('Vorgang');
              const statusColor = r.status === 'open' ? 'default' : r.status === 'consumed' ? 'secondary' : 'outline';
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 font-mono">{r.art_nr}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[220px]">{r.articles?.matchcode || ''}{r.articles?.bezeich_1 ? ' · ' + r.articles.bezeich_1 : ''}</td>
                  <td className="px-3 py-2">{r.warehouses?.code || '–'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{Number(r.quantity).toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2">
                    {links.length === 0 ? <span className="text-muted-foreground">–</span> : (
                      <div className="flex gap-1 flex-wrap">{links.map(l => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2"><Badge variant={statusColor as any} className="text-[10px]">{r.status}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground text-[10px]">{r.expires_at ? new Date(r.expires_at).toLocaleDateString('de-DE') : '–'}</td>
                  <td className="px-3 py-2">
                    {canWrite && r.status === 'open' && (
                      <div className="flex gap-1">
                        <button onClick={() => setStatus(r.id, 'consumed')} className="text-[10px] text-muted-foreground hover:text-foreground underline">verbraucht</button>
                        <button onClick={() => setStatus(r.id, 'released')} className="text-[10px] text-muted-foreground hover:text-destructive underline">freigeben</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NewReservationDialog open={open} onClose={() => setOpen(false)} onDone={fetchData} />
    </div>
  );
}

function NewReservationDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [artNr, setArtNr] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [orderId, setOrderId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [saving, setSaving] = useState(false);
  const { orders, projects, cases } = useEntityOptions();

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
    if (!qty || isNaN(qty) || qty <= 0) { toast.error('Menge ungültig'); return; }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from('stock_reservations').insert({
      art_nr: artNr,
      warehouse_id: warehouseId,
      quantity: qty,
      note: note.trim() || null,
      order_id: orderId || null,
      project_id: projectId || null,
      case_id: caseId || null,
      expires_at: expiresAt || null,
      created_by: userData.user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Reservierung angelegt');
    setArtNr(null); setQuantity(''); setNote(''); setExpiresAt('');
    setOrderId(''); setProjectId(''); setCaseId('');
    onDone(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Reservierung anlegen</DialogTitle>
          <DialogDescription className="text-xs">Reduziert die verfügbare Menge, ohne den Bestand zu verändern.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Artikel</label>
            <ArticlePicker
              value={artNr}
              onChange={(a) => setArtNr(a?.art_nr || null)}
              inStockOnly={true}
              inStockWarehouseId={warehouseId || null}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Lager</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Lager wählen" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Menge</label>
              <Input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="h-8 text-xs" inputMode="decimal" />
            </div>
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verknüpfung (optional)</div>
            <div className="grid grid-cols-3 gap-2">
              <EntitySelect label="Bestellung" value={orderId} onChange={setOrderId} options={orders} />
              <EntitySelect label="Projekt" value={projectId} onChange={setProjectId} options={projects} />
              <EntitySelect label="Vorgang" value={caseId} onChange={setCaseId} options={cases} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Ablauf (optional)</label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Notiz</label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" className="h-8 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">{saving ? 'Speichere…' : 'Reservieren'}</Button>
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
    if (!confirm('Lager wirklich löschen?\n\nAlle Lagerbewegungen und Bestände dieses Lagers werden mitgelöscht. Wareneingänge, Bestellungen und Lieferpositionen bleiben erhalten, das Lager-Feld wird dort geleert.')) return;
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
