import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArticlePicker, type ArticleOption } from './ArticlePicker';
import { Plus, Trash2, ArrowUpFromLine, BookmarkCheck } from 'lucide-react';
import { toast } from 'sonner';

type Warehouse = { id: string; code: string; name: string };
type Movement = {
  id: string;
  art_nr: string;
  warehouse_id: string;
  movement_type: 'inbound' | 'outbound' | 'adjustment' | 'transfer';
  quantity: number;
  note: string | null;
  lot_no: string | null;
  serial_no: string | null;
  created_at: string;
  articles?: { matchcode: string | null; bezeich_1: string | null; me: string | null } | null;
  warehouses?: { code: string } | null;
};
type Reservation = {
  id: string;
  art_nr: string;
  warehouse_id: string;
  quantity: number;
  status: 'open' | 'released' | 'consumed';
  note: string | null;
  created_at: string;
  articles?: { matchcode: string | null; bezeich_1: string | null; me: string | null } | null;
  warehouses?: { code: string } | null;
};

interface Props {
  caseId: string;
  canEdit: boolean;
}

export function CaseArticles({ caseId, canEdit }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [wh, mv, rv] = await Promise.all([
      supabase.from('warehouses').select('id,code,name').order('code'),
      supabase
        .from('stock_movements')
        .select('id,art_nr,warehouse_id,movement_type,quantity,note,lot_no,serial_no,created_at,articles(matchcode,bezeich_1,me),warehouses!stock_movements_warehouse_id_fkey(code)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false }),
      supabase
        .from('stock_reservations')
        .select('id,art_nr,warehouse_id,quantity,status,note,created_at,articles(matchcode,bezeich_1,me),warehouses(code)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false }),
    ]);
    setWarehouses((wh.data as Warehouse[]) || []);
    setMovements((mv.data as any) || []);
    setReservations((rv.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [caseId]);

  const releaseReservation = async (id: string) => {
    const { error } = await supabase.from('stock_reservations').update({ status: 'released' }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Reservierung freigegeben');
    load();
  };

  const consumeReservation = async (r: Reservation) => {
    // create outbound movement, mark reservation consumed
    const { data: { user } } = await supabase.auth.getUser();
    const { error: mErr } = await supabase.from('stock_movements').insert({
      art_nr: r.art_nr,
      warehouse_id: r.warehouse_id,
      movement_type: 'outbound',
      quantity: r.quantity,
      case_id: caseId,
      note: r.note ?? 'Reservierung verbraucht',
      created_by: user?.id ?? null,
    } as any);
    if (mErr) { toast.error(mErr.message); return; }
    await supabase.from('stock_reservations').update({ status: 'consumed' }).eq('id', r.id);
    toast.success('Ausbuchung erfasst');
    load();
  };

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Artikel</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Verknüpfen
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Lädt…</p>
      ) : (movements.length === 0 && reservations.length === 0) ? (
        <p className="text-xs text-muted-foreground">Keine Artikel verknüpft.</p>
      ) : (
        <div className="space-y-3">
          {reservations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Reservierungen</p>
              {reservations.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs border border-border rounded px-2 py-1.5">
                  <BookmarkCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{r.art_nr} <span className="text-muted-foreground">· {r.articles?.matchcode || r.articles?.bezeich_1 || ''}</span></div>
                    <div className="text-muted-foreground">
                      {r.quantity} {r.articles?.me || ''} · {r.warehouses?.code || ''}
                      {r.note && ` · ${r.note}`}
                    </div>
                  </div>
                  <Badge variant={r.status === 'open' ? 'default' : 'secondary'} className="text-[10px]">
                    {r.status === 'open' ? 'offen' : r.status === 'consumed' ? 'verbraucht' : 'freigegeben'}
                  </Badge>
                  {canEdit && r.status === 'open' && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => consumeReservation(r)}>
                        Ausbuchen
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => releaseReservation(r.id)}>
                        Freigeben
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {movements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Bewegungen</p>
              {movements.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-xs border border-border rounded px-2 py-1.5">
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{m.art_nr} <span className="text-muted-foreground">· {m.articles?.matchcode || m.articles?.bezeich_1 || ''}</span></div>
                    <div className="text-muted-foreground">
                      {m.movement_type} · {m.quantity} {m.articles?.me || ''} · {m.warehouses?.code || ''}
                      {m.lot_no && ` · Charge ${m.lot_no}`}
                      {m.serial_no && ` · SN ${m.serial_no}`}
                      {m.note && ` · ${m.note}`}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleDateString('de-DE')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <LinkArticleDialog
        open={open}
        onClose={() => setOpen(false)}
        caseId={caseId}
        warehouses={warehouses}
        onSaved={load}
      />
    </div>
  );
}

function LinkArticleDialog({ open, onClose, caseId, warehouses, onSaved }: {
  open: boolean; onClose: () => void; caseId: string; warehouses: Warehouse[]; onSaved: () => void;
}) {
  const [mode, setMode] = useState<'reservation' | 'outbound'>('reservation');
  const [art, setArt] = useState<ArticleOption | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [qty, setQty] = useState<string>('1');
  const [lot, setLot] = useState('');
  const [serial, setSerial] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setArt(null); setQty('1'); setLot(''); setSerial(''); setNote('');
      setWarehouseId(warehouses[0]?.id || '');
      setMode('reservation');
    }
  }, [open, warehouses]);

  const save = async () => {
    if (!art || !warehouseId || !qty) { toast.error('Artikel, Lager und Menge erforderlich'); return; }
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error('Ungültige Menge'); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (mode === 'reservation') {
      const { error } = await supabase.from('stock_reservations').insert({
        art_nr: art.art_nr,
        warehouse_id: warehouseId,
        quantity,
        case_id: caseId,
        note: note || null,
        status: 'open',
        created_by: user?.id ?? null,
      } as any);
      if (error) { toast.error(error.message); setBusy(false); return; }
    } else {
      const { error } = await supabase.from('stock_movements').insert({
        art_nr: art.art_nr,
        warehouse_id: warehouseId,
        movement_type: 'outbound',
        quantity,
        case_id: caseId,
        lot_no: lot || null,
        serial_no: serial || null,
        note: note || null,
        created_by: user?.id ?? null,
      } as any);
      if (error) { toast.error(error.message); setBusy(false); return; }
    }
    setBusy(false);
    toast.success(mode === 'reservation' ? 'Reservierung erstellt' : 'Ausbuchung erfasst');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Artikel verknüpfen</DialogTitle>
          <DialogDescription>Reserviere Lagerbestand für diesen Vorgang oder buche direkt aus.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={mode === 'reservation' ? 'default' : 'outline'} onClick={() => setMode('reservation')}>
              Reservierung
            </Button>
            <Button type="button" size="sm" variant={mode === 'outbound' ? 'default' : 'outline'} onClick={() => setMode('outbound')}>
              Direkt ausbuchen
            </Button>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Artikel</label>
            <ArticlePicker
              value={art?.art_nr ?? null}
              onChange={setArt}
              inStockOnly={mode === 'outbound'}
              inStockWarehouseId={mode === 'outbound' ? warehouseId : null}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Lager</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Lager" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Menge</label>
              <Input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
          </div>

          {mode === 'outbound' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Charge (optional)</label>
                <Input value={lot} onChange={e => setLot(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Seriennummer (optional)</label>
                <Input value={serial} onChange={e => setSerial(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notiz (optional)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Speichert…' : 'Speichern'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
