import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CameraScanner } from '@/components/erp/CameraScanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { parseScan } from '@/lib/scan';
import { toast } from 'sonner';

const db = supabase as any;
type Wo = { id: string; wo_no: string | null; art_nr: string; description: string | null; quantity: number; quantity_done: number; status: string; lot_no: string | null };

/** Fertigmeldung per Scan (Auftragsnummer oder Artikelnummer). Doppelmeldungen verhindert die Server-Funktion. */
export function ScanProductionComplete({ canBook }: { canBook: boolean }) {
  const [list, setList] = useState<Wo[]>([]);
  const [woId, setWoId] = useState('');
  const [qty, setQty] = useState('');
  const [lot, setLot] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const wo = list.find((w) => w.id === woId);

  const pick = (w?: Wo) => { setWoId(w?.id ?? ''); setQty(w ? String(Number(w.quantity) - Number(w.quantity_done)) : ''); setLot(w?.lot_no ?? ''); setRequestId(crypto.randomUUID()); };

  const load = async (code: string) => {
    const cols = 'id, wo_no, art_nr, description, quantity, quantity_done, status, lot_no';
    let { data } = await db.from('production_orders').select(cols).eq('wo_no', code).limit(1);
    if (!data?.length) {
      const { data: byEan } = await db.from('articles').select('art_nr').eq('ean', code).maybeSingle();
      ({ data } = await db.from('production_orders').select(cols).eq('art_nr', byEan?.art_nr ?? code).order('created_at').limit(50));
    }
    const open = ((data ?? []) as Wo[]).filter((w) => w.status !== 'completed' && w.status !== 'cancelled');
    setList(open); pick(open[0]);
    if (!data?.length) toast.error(`Kein Werkstattauftrag zu ${code}`);
    else if (!open.length) toast.error('Werkstattauftrag bereits fertig gemeldet oder storniert');
  };

  const book = async () => {
    if (!wo || busy) return;
    const q = Number(qty.replace(',', '.'));
    const rest = Number(wo.quantity) - Number(wo.quantity_done);
    if (!(q > 0) || q > rest) { toast.error(`Menge zwischen 0 und ${rest}`); return; }
    setBusy(true);
    const { data, error } = await db.rpc('scan_production_complete', { _id: wo.id, _qty: q, _expected_done: Number(wo.quantity_done), _request_id: requestId, _lot_no: lot || null });
    setBusy(false);
    if (error) { toast.error(error.message); await load(wo.wo_no ?? wo.art_nr); return; }
    toast.success(data?.duplicate ? 'Bereits gemeldet – keine zweite Buchung' : `Fertig gemeldet: ${data?.received} (gesamt ${data?.done} von ${wo.quantity})`);
    setList([]); pick(undefined);
  };

  return (
    <>
      <CameraScanner onScan={(raw) => load(parseScan(raw))} placeholder="Auftrags- oder Artikelnummer" />
      {list.length > 0 && wo && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="space-y-1"><Label className="text-xs">Werkstattauftrag</Label>
            <Select value={woId} onValueChange={(v) => pick(list.find((w) => w.id === v))}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{list.map((w) => <SelectItem key={w.id} value={w.id}>{w.wo_no} · {w.quantity_done}/{w.quantity}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><p className="font-mono text-sm">{wo.art_nr}</p><p className="text-xs text-muted-foreground">{wo.description}</p>
            <p className="text-xs mt-1">Gemeldet: <span className="tabular-nums">{wo.quantity_done} von {wo.quantity}</span></p></div>
          <div className="space-y-1"><Label className="text-xs">Fertige Menge</Label>
            <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 text-right text-lg" aria-label="Fertige Menge" /></div>
          <Input placeholder="Charge (optional)" value={lot} onChange={(e) => setLot(e.target.value)} className="h-11" />
          <Button className="w-full h-12" disabled={busy || !canBook} onClick={book}>Fertig melden</Button>
        </div>
      )}
    </>
  );
}
