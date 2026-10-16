import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Plus, Wrench, PackageMinus, PackagePlus, PackageSearch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SubcontractOrders } from '@/components/erp/SubcontractOrders';

type Wo = {
  id: string;
  wo_no: string | null;
  art_nr: string;
  description: string | null;
  quantity: number;
  quantity_done: number;
  warehouse_id: string;
  status: 'draft' | 'released' | 'issued' | 'completed' | 'cancelled' | string;
  lot_no: string | null;
  note: string | null;
  issued_at: string | null;
  completed_at: string | null;
  created_at: string;
};
type WoItem = {
  id: string;
  pos: string | null;
  component_art_nr: string;
  description: string | null;
  qty_per_unit: number;
  qty_required: number;
  qty_issued: number;
  me: string | null;
};
type Warehouse = { id: string; code: string; name: string };
type BomRow = { component_art_nr: string; component_bezeichnung: string | null; component_matchcode: string | null; menge: number | null; me: string | null; pos: string | null };

const fmtN = (n: number | null | undefined, d = 3) =>
  n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDT = (d: string | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', released: 'Freigegeben', issued: 'Material gebucht', completed: 'Abgeschlossen', cancelled: 'Storniert',
};

export default function AdminProduction() {
  const { isAdmin, loading, role } = useAuth();
  const canUse = isAdmin || role === 'staff';

  const [rows, setRows] = useState<Wo[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'open' | 'all' | 'completed'>('open');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Wo | null>(null);

  const load = async () => {
    setBusy(true);
    const sb = supabase as any;
    const [wo, wh] = await Promise.all([
      sb.from('production_orders').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('warehouses').select('id, code, name').order('name'),
    ]);
    setBusy(false);
    if (wo.error) { toast.error('Laden fehlgeschlagen'); return; }
    setRows((wo.data || []) as Wo[]);
    setWarehouses((wh.data || []) as Warehouse[]);
  };

  useEffect(() => { if (canUse) load(); }, [canUse]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (status === 'open' && (r.status === 'completed' || r.status === 'cancelled')) return false;
      if (status === 'completed' && r.status !== 'completed') return false;
      if (!s) return true;
      return (r.wo_no || '').toLowerCase().includes(s)
        || r.art_nr.toLowerCase().includes(s)
        || (r.description || '').toLowerCase().includes(s);
    });
  }, [rows, status, search]);

  if (loading) return <AppLayout><div className="p-6">Laden…</div></AppLayout>;
  if (!canUse) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1400px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" /> Werkstattaufträge
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fertigung nach Stückliste: Einzelteile ausbuchen, fertiges Werkteil einbuchen.
            </p>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Neuer Werkstattauftrag
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Suche WA-Nr, Artikel…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 max-w-sm text-xs" />
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Offene</SelectItem>
              <SelectItem value="completed">Abgeschlossene</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} Aufträge</span>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={busy}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', busy && 'animate-spin')} /> Aktualisieren
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">WA-Nr</th>
                  <th className="px-2 py-2 text-left">Artikel</th>
                  <th className="px-2 py-2 text-left">Bezeichnung</th>
                  <th className="px-2 py-2 text-right">Menge</th>
                  <th className="px-2 py-2 text-right">Fertig</th>
                  <th className="px-2 py-2 text-left">Lager</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Angelegt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Keine Werkstattaufträge</td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetail(r)}>
                    <td className="px-2 py-1.5 font-mono font-medium text-foreground">{r.wo_no || '–'}</td>
                    <td className="px-2 py-1.5 font-mono">{r.art_nr}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.description || '–'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.quantity, 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.quantity_done, 0)}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{warehouses.find(w => w.id === r.warehouse_id)?.name || '–'}</td>
                    <td className="px-2 py-1.5">
                      <Badge variant={r.status === 'completed' ? 'secondary' : r.status === 'cancelled' ? 'destructive' : 'outline'} className="text-[10px] h-4 px-1.5">
                        {STATUS_LABEL[r.status] || r.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{fmtDT(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <CreateDialog
        open={createOpen}
        warehouses={warehouses}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }}
      />
      <DetailDialog wo={detail} onClose={() => setDetail(null)} onChanged={() => { load(); setDetail(null); }} />
    </AppLayout>
  );
}

function CreateDialog({ open, warehouses, onClose, onCreated }:
  { open: boolean; warehouses: Warehouse[]; onClose: () => void; onCreated: () => void }) {
  const [artNr, setArtNr] = useState('');
  const [qty, setQty] = useState('1');
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [bom, setBom] = useState<BomRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [infoArt, setInfoArt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setArtNr(''); setQty('1'); setNote(''); setBom(null); }
    if (open && !warehouseId && warehouses.length) setWarehouseId(warehouses[0].id);
  }, [open, warehouses]);

  useEffect(() => {
    const a = artNr.trim();
    if (!a) { setBom(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('article_bom')
        .select('pos, component_art_nr, component_bezeichnung, component_matchcode, menge, me')
        .eq('parent_art_nr', a)
        .order('pos')
        .limit(200);
      if (!cancelled) setBom((data || []) as BomRow[]);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [artNr]);

  const factor = Number(qty.replace(',', '.')) || 0;

  const submit = async () => {
    if (!artNr.trim() || factor <= 0 || !warehouseId) { toast.error('Artikel, Menge und Lager erforderlich'); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc('create_production_order', {
      _art_nr: artNr.trim(), _quantity: factor, _warehouse_id: warehouseId, _note: note.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message || 'Anlegen fehlgeschlagen'); return; }
    toast.success('Werkstattauftrag angelegt');
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-sm">Neuer Werkstattauftrag</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Artikel (Werkteil)</Label>
              <Input value={artNr} onChange={(e) => setArtNr(e.target.value)} placeholder="Art.-Nr." className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Menge</Label>
              <Input value={qty} onChange={(e) => setQty(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Lager</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Lager wählen" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Notiz</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs" />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-foreground">Stückliste</div>
            {bom === null && <div className="text-muted-foreground">Artikel eingeben, um die Stückliste zu laden.</div>}
            {bom !== null && bom.length === 0 && (
              <div className="text-destructive">Für diesen Artikel ist keine Stückliste hinterlegt.</div>
            )}
            {bom !== null && bom.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Pos</th>
                      <th className="px-2 py-1.5 text-left">Komponente</th>
                      <th className="px-2 py-1.5 text-left">Bezeichnung</th>
                      <th className="px-2 py-1.5 text-right">je Stück</th>
                      <th className="px-2 py-1.5 text-right">Bedarf</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bom.map((b, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 text-muted-foreground">{b.pos || '–'}</td>
                        <td className="px-2 py-1 font-mono">
                          <button type="button" className="hover:underline underline-offset-2 cursor-pointer"
                            onClick={() => setInfoArt(b.component_art_nr)} title="Artikel-Infos anzeigen">
                            {b.component_art_nr}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{b.component_bezeichnung || b.component_matchcode || '–'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtN(b.menge ?? 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">{fmtN((Number(b.menge) || 1) * factor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>Abbrechen</Button>
          <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={saving || !bom || bom.length === 0}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
      <ArticleInfoDialog artNr={infoArt} onClose={() => setInfoArt(null)} />
    </Dialog>
  );
}

type Avail = { item_id: string; qty_open: number; qty_available: number; shortage: number };

function DetailDialog({ wo, onClose, onChanged }: { wo: Wo | null; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<WoItem[]>([]);
  const [avail, setAvail] = useState<Record<string, Avail>>({});
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [doneQty, setDoneQty] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [infoArt, setInfoArt] = useState<string | null>(null);
  const [externalPending, setExternalPending] = useState(true);

  useEffect(() => {
    if (!wo) return;
    setExternalPending(true);
    setDoneQty(String(wo.quantity - wo.quantity_done));
    setLotNo(wo.lot_no || '');
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data, error }, av] = await Promise.all([
        (supabase as any).from('production_order_items').select('*').eq('production_order_id', wo.id).order('pos'),
        (supabase as any).rpc('production_order_availability', { _id: wo.id }),
      ]);
      setLoading(false);
      if (cancelled) return;
      if (error) { toast.error('Positionen konnten nicht geladen werden'); return; }
      setItems((data || []) as WoItem[]);
      const map: Record<string, Avail> = {};
      for (const r of ((av?.data || []) as Avail[])) map[r.item_id] = r;
      setAvail(map);
    })();
    return () => { cancelled = true; };
  }, [wo, reloadKey]);

  const openQty = items.reduce((s, i) => s + Math.max(0, i.qty_required - i.qty_issued), 0);
  const allIssued = items.length > 0 && openQty === 0;
  const shortItems = items.filter(i => (avail[i.id]?.shortage || 0) > 0);
  const issuableQty = items.reduce((s, i) => {
    const a = avail[i.id];
    const open = Math.max(0, i.qty_required - i.qty_issued);
    return s + (a ? Math.min(open, Math.max(0, a.qty_available)) : open);
  }, 0);

  const issue = async (allowPartial = false) => {
    if (!wo) return;
    setWorking(true);
    const { data, error } = await (supabase as any).rpc('production_order_issue', { _id: wo.id, _allow_partial: allowPartial });
    setWorking(false);
    if (error) { toast.error(error.message || 'Ausbuchen fehlgeschlagen'); return; }
    const short = (data as any)?.short_positions || 0;
    if (short > 0) toast.warning(`Teilentnahme gebucht · ${short} Position(en) weiterhin offen`);
    else toast.success('Einzelteile ausgebucht');
    setReloadKey(k => k + 1);
    onChanged();
  };

  const complete = async () => {
    if (!wo) return;
    const q = Number(doneQty.replace(',', '.'));
    if (!q || q <= 0) { toast.error('Menge muss größer 0 sein'); return; }
    setWorking(true);
    const { error } = await (supabase as any).rpc('production_order_complete', {
      _id: wo.id, _qty: q, _lot_no: lotNo.trim() || null,
    });
    setWorking(false);
    if (error) { toast.error(error.message || 'Einbuchen fehlgeschlagen'); return; }
    toast.success('Werkteil eingebucht');
    onChanged();
  };

  return (
    <Dialog open={!!wo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Werkstattauftrag <span className="font-mono">{wo?.wo_no}</span>
            <span className="text-muted-foreground font-normal"> · {wo?.art_nr} {wo?.description ? `· ${wo.description}` : ''}</span>
          </DialogTitle>
        </DialogHeader>

        {wo && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{STATUS_LABEL[wo.status] || wo.status}</Badge>
              <span className="text-muted-foreground">
                Auftragsmenge {fmtN(wo.quantity, 0)} · fertig {fmtN(wo.quantity_done, 0)} · Material gebucht {wo.issued_at ? fmtDT(wo.issued_at) : 'nein'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-foreground">Einzelteile (Stückliste)</div>
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Pos</th>
                      <th className="px-2 py-1.5 text-left">Komponente</th>
                      <th className="px-2 py-1.5 text-left">Bezeichnung</th>
                      <th className="px-2 py-1.5 text-right">je Stück</th>
                      <th className="px-2 py-1.5 text-right">Bedarf</th>
                      <th className="px-2 py-1.5 text-right">ausgebucht</th>
                      <th className="px-2 py-1.5 text-right">Bestand</th>
                      <th className="px-2 py-1.5 text-right">fehlt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading && <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">Laden…</td></tr>}
                    {!loading && items.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">Keine Positionen</td></tr>}
                    {items.map(i => {
                      const a = avail[i.id];
                      const short = a?.shortage || 0;
                      return (
                      <tr key={i.id} className={cn(short > 0 && 'bg-destructive/5')}>
                        <td className="px-2 py-1 text-muted-foreground">{i.pos || '–'}</td>
                        <td className="px-2 py-1 font-mono">
                          <button type="button" className="hover:underline underline-offset-2 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setInfoArt(i.component_art_nr); }} title="Artikel-Infos anzeigen">
                            {i.component_art_nr}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{i.description || '–'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtN(i.qty_per_unit)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtN(i.qty_required)}</td>
                        <td className={cn('px-2 py-1 text-right tabular-nums', i.qty_issued >= i.qty_required ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                          {fmtN(i.qty_issued)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{a ? fmtN(a.qty_available) : '–'}</td>
                        <td className={cn('px-2 py-1 text-right tabular-nums', short > 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                          {short > 0 ? fmtN(short) : '–'}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <SubcontractOrders key={wo.id} productionOrder={{ id: wo.id, wo_no: wo.wo_no, warehouse_id: wo.warehouse_id, canCreate: !loading && wo.quantity_done === 0 && items.every(i => i.qty_issued === 0) && !['completed', 'cancelled'].includes(wo.status) }} onStepsChange={setExternalPending} />

            {externalPending && <p className="text-muted-foreground">Fremdbearbeitung: Rücknahme ausstehend</p>}
            {wo.status !== 'completed' && wo.status !== 'cancelled' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="p-3 space-y-2">
                  <div className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <PackageMinus className="h-3.5 w-3.5 text-amber-500" /> Einzelteile ausbuchen
                  </div>
                  <p className="text-muted-foreground">
                    Bucht alle offenen Stücklisten-Mengen als Abgang aus dem Lager ({fmtN(openQty)} offen).
                  </p>
                  {shortItems.length > 0 && !allIssued && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                      Zu wenig Bestand bei {shortItems.length} Position(en). Vollständige Entnahme ist gesperrt –
                      möglich sind {fmtN(issuableQty)} von {fmtN(openQty)}.
                    </div>
                  )}
                  <Button size="sm" className="h-8 text-xs w-full" onClick={() => issue(false)} disabled={working || externalPending || allIssued || items.length === 0 || shortItems.length > 0}>
                    {working && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {allIssued ? 'Bereits ausgebucht' : 'Material entnehmen'}
                  </Button>
                  {shortItems.length > 0 && !allIssued && (
                    <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={() => issue(true)} disabled={working || externalPending || issuableQty <= 0}>
                      Nur verfügbare Mengen entnehmen
                    </Button>
                  )}
                </Card>

                <Card className="p-3 space-y-2">
                  <div className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <PackagePlus className="h-3.5 w-3.5 text-emerald-500" /> Werkteil einbuchen
                  </div>
                  <div className="flex gap-2">
                    <div className="space-y-1 flex-1">
                      <Label className="text-[10px]">Menge</Label>
                      <Input value={doneQty} onChange={(e) => setDoneQty(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-[10px]">Charge (optional)</Label>
                      <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} className="h-8 text-xs font-mono" />
                    </div>
                  </div>
                  <Button size="sm" className="h-8 text-xs w-full" onClick={complete} disabled={working || externalPending || !allIssued}>
                    {working && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {allIssued ? 'Fertig melden & einbuchen' : 'Erst Material ausbuchen'}
                  </Button>
                </Card>
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <ArticleInfoDialog artNr={infoArt} onClose={() => setInfoArt(null)} />
    </Dialog>
  );
}

type ArticleStockRow = { quantity: number | null; min_quantity: number | null; warehouses: { code: string; name: string } | null };

function ArticleInfoDialog({ artNr, onClose }: { artNr: string | null; onClose: () => void }) {
  const [article, setArticle] = useState<Record<string, any> | null>(null);
  const [stock, setStock] = useState<ArticleStockRow[]>([]);
  const [bomCount, setBomCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artNr) return;
    let cancelled = false;
    setLoading(true);
    setArticle(null); setStock([]); setBomCount(null);
    (async () => {
      const sb = supabase as any;
      const [a, s, b] = await Promise.all([
        sb.from('articles').select('*').eq('art_nr', artNr).maybeSingle(),
        sb.from('inventory_stock').select('quantity, min_quantity, warehouses(code, name)').eq('art_nr', artNr),
        sb.from('article_bom').select('pos', { count: 'exact', head: true }).eq('parent_art_nr', artNr),
      ]);
      if (cancelled) return;
      setArticle(a.data || null);
      setStock((s.data || []) as ArticleStockRow[]);
      setBomCount(b.count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [artNr]);

  const totalQty = stock.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const row = (label: string, value: any) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium break-words">{value == null || value === '' ? '–' : String(value)}</span>
    </div>
  );

  return (
    <Dialog open={!!artNr} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" /> Komponente
            <span className="font-mono">{artNr}</span>
          </DialogTitle>
        </DialogHeader>
        {loading && <div className="text-xs text-muted-foreground py-4">Laden…</div>}
        {!loading && !article && <div className="text-xs text-muted-foreground py-4">Keine Artikel-Stammdaten zu dieser Nummer gefunden.</div>}
        {!loading && article && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="text-[11px] font-medium text-foreground mb-1">Stammdaten</div>
              {row('Bezeichnung', article.bezeich_1)}
              {row('Bezeichnung 2', article.bezeich_2)}
              {row('Matchcode', article.matchcode)}
              {row('Mengeneinheit', article.me)}
              {row('Packeinheit', article.pe)}
              {article.is_blocked && (
                <div className="mt-1.5"><Badge variant="destructive" className="text-[10px] h-4 px-1.5">Gesperrt</Badge></div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-medium text-foreground mb-1">Technische Daten</div>
              {row('Material', article.material)}
              {row('Ausführung', article.ausfuehrung)}
              {row('Körper', article.koerper)}
              {row('Pins', article.pins)}
              {row('Rastermaß', article.rastermass)}
              {row('Pinlänge', article.pinlaenge)}
              {row('Höhe', article.hoehe)}
              {row('Gewinde', article.gewinde)}
              {row('Nutzgewinde', article.nutz_gewinde)}
              {row('Galvanik', article.galvanik)}
              {row('Dichtring', article.dichtring)}
            </div>

            <div>
              <div className="text-[11px] font-medium text-foreground mb-1">Verwaltung</div>
              {row('Artikelgruppe', article.art_gr)}
              {row('Materialart', article.mat_art)}
              {row('Dispo-Kennzeichen', article.dispo_kz_label || article.dispo_kz)}
              {row('Status', article.art_stat_label || article.art_stat)}
              {row('Kennung', article.kennung_label || article.kennung)}
              {row('Zolltarif-Nr.', article.zolltarif_nr)}
              {row('Zeichnungs-Nr.', article.zeichnung_nr)}
              {row('Bautyp', article.bautyp)}
            </div>

            <div>
              <div className="text-[11px] font-medium text-foreground mb-1">Bestand je Lager</div>
              {stock.length === 0 && <div className="text-muted-foreground py-1">Kein Bestand gebucht.</div>}
              {stock.length > 0 && (
                <div className="rounded-md border border-border/60 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left">Lager</th>
                        <th className="px-2 py-1 text-right">Bestand</th>
                        <th className="px-2 py-1 text-right">Mindestbestand</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stock.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-muted-foreground">{s.warehouses?.name || s.warehouses?.code || '–'}</td>
                          <td className={cn('px-2 py-1 text-right tabular-nums font-medium', (Number(s.quantity) || 0) <= 0 && 'text-destructive')}>
                            {fmtN(s.quantity ?? 0)}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{fmtN(s.min_quantity ?? 0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30">
                        <td className="px-2 py-1 font-medium">Gesamt</td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">{fmtN(totalQty)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="text-muted-foreground">
              {bomCount && bomCount > 0
                ? <>Diese Komponente hat eine eigene Stückliste ({bomCount} Position{bomCount === 1 ? '' : 'en'}).</>
                : <>Keine eigene Stückliste hinterlegt.</>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
