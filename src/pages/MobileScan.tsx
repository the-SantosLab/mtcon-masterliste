import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { CameraScanner } from '@/components/erp/CameraScanner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { parseScan, openPoLines, issueAllowed } from '@/lib/scan';
import { toast } from 'sonner';
import { ScanProductionComplete } from '@/components/erp/ScanProductionComplete';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

type Mode = 'receipt' | 'issue' | 'count' | 'done';
const db = supabase as any;

export default function MobileScan() {
  const { isAdmin, role } = useAuth();
  const canBook = isAdmin || role === 'staff';
  const [mode, setMode] = useState<Mode>('receipt');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [wh, setWh] = useState('');
  const [counts, setCounts] = useState<any[]>([]);
  const [countId, setCountId] = useState('');
  const [art, setArt] = useState<any | null>(null);
  const [onHand, setOnHand] = useState(0);
  const [lines, setLines] = useState<ReturnType<typeof openPoLines>>([]);
  const [lineId, setLineId] = useState('');
  const [countItem, setCountItem] = useState<any | null>(null);
  const [qty, setQty] = useState('');
  const [lot, setLot] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [overAsk, setOverAsk] = useState<{ open: number; qty: number } | null>(null);

  useEffect(() => {
    db.from('warehouses').select('id, code, name, is_default').order('code').then(({ data }: any) => {
      setWarehouses(data ?? []); setWh((data ?? []).find((w: any) => w.is_default)?.id ?? data?.[0]?.id ?? '');
    });
    db.from('stock_counts').select('id, count_no, warehouse_id, warehouses(code, name)').eq('status', 'counting').order('created_at', { ascending: false })
      .then(({ data }: any) => { setCounts(data ?? []); setCountId(data?.[0]?.id ?? ''); });
  }, []);

  const reset = () => { setArt(null); setLines([]); setLineId(''); setCountItem(null); setQty(''); setLot(''); setNote(''); };
  useEffect(reset, [mode]);

  const onScan = async (raw: string) => {
    const scanned = parseScan(raw);
    let code = scanned;
    let { data: a } = await db.from('articles').select('art_nr, bezeich_1, me').eq('art_nr', code).maybeSingle();
    if (!a) ({ data: a } = await db.from('articles').select('art_nr, bezeich_1, me').eq('ean', code).maybeSingle());
    if (!a) { toast.error(`Artikel oder EAN ${scanned} nicht gefunden`); return; }
    code = a.art_nr;
    reset(); setArt(a);
    const warehouse = mode === 'count' ? counts.find((c) => c.id === countId)?.warehouse_id : wh;
    const { data: st } = await db.from('inventory_stock').select('quantity').eq('art_nr', code).eq('warehouse_id', warehouse).maybeSingle();
    setOnHand(Number(st?.quantity ?? 0));
    if (mode === 'receipt') {
      const { data } = await db.from('purchase_order_items').select('id, qty_ordered, qty_received, purchase_orders!inner(po_no, status, expected_at, confirmed_delivery_date)').eq('art_nr', code).limit(200);
      const l = openPoLines((data ?? []).map((r: any) => ({ id: r.id, po_no: r.purchase_orders.po_no, status: r.purchase_orders.status, qty_ordered: Number(r.qty_ordered), qty_received: Number(r.qty_received), expected_at: r.purchase_orders.confirmed_delivery_date || r.purchase_orders.expected_at })));
      setLines(l); setLineId(l[0]?.id ?? '');
      if (!l.length) toast.error('Keine offene Bestellung für diesen Artikel');
    }
    if (mode === 'count' && countId) {
      const { data } = await db.from('stock_count_items').select('id, expected_qty, counted_qty').eq('count_id', countId).eq('art_nr', code).maybeSingle();
      setCountItem(data ?? null); if (data?.counted_qty != null) setQty(String(data.counted_qty));
    }
  };

  const book = async (overDecision?: 'accepted' | 'rejected') => {
    setOverAsk(null);
    const q = Number(qty.replace(',', '.'));
    if (!art || !(q >= 0) || (mode !== 'count' && q <= 0)) { toast.error('Menge prüfen'); return; }
    setBusy(true);
    let error: any = null;
    if (mode === 'receipt') {
      const l = lines.find((x) => x.id === lineId);
      if (!l) { setBusy(false); return; }
      if (q > l.open && !overDecision) { setBusy(false); setOverAsk({ open: l.open, qty: q }); return; }
      ({ error } = await db.rpc('scan_goods_receipt', { _po_item_id: lineId, _warehouse_id: wh, _qty: q, _lot_no: lot || null, _delivery_note_no: note || null, _over_decision: q > l.open ? overDecision : null }));
    } else if (mode === 'issue') {
      if (!issueAllowed(q, onHand)) { setBusy(false); toast.error(`Bestand nur ${onHand}`); return; }
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await db.from('stock_movements').insert({ art_nr: art.art_nr, warehouse_id: wh, movement_type: 'outbound', quantity: q, note: note || 'Entnahme per Scan', created_by: user?.id ?? null, reference_type: 'scan' }));
    } else {
      let id = countItem?.id;
      if (!id) {
        ({ error } = await db.rpc('add_stock_count_item', { _count_id: countId, _art_nr: art.art_nr }));
        if (!error) id = (await db.from('stock_count_items').select('id').eq('count_id', countId).eq('art_nr', art.art_nr).maybeSingle()).data?.id;
      }
      if (!error) ({ error } = await db.from('stock_count_items').update({ counted_qty: q }).eq('id', id));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === 'receipt' ? 'Auf i-Punkt gebucht, Prüfvorgang an QS/QM übergeben' : mode === 'issue' ? 'Entnahme gebucht' : 'Zählmenge gespeichert');
    reset();
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-md space-y-4 pb-24">
        <div><h1 className="text-xl font-semibold">Scannen</h1><p className="text-xs text-muted-foreground">Wareneingang, Entnahme, Inventur und Fertigmeldung mit Handykamera</p></div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full"><TabsTrigger value="receipt" className="flex-1">Wareneingang</TabsTrigger><TabsTrigger value="issue" className="flex-1">Entnahme</TabsTrigger><TabsTrigger value="count" className="flex-1">Inventur</TabsTrigger><TabsTrigger value="done" className="flex-1">Fertig</TabsTrigger></TabsList>
        </Tabs>
        {!canBook && <p className="rounded border border-border p-3 text-xs text-muted-foreground">Nur Ansicht: Buchen ist Admins und Mitarbeitenden vorbehalten.</p>}
        {mode === 'done' ? <ScanProductionComplete canBook={canBook} /> : <>
        {mode === 'count' ? (
          <div className="space-y-1"><Label className="text-xs">Laufende Inventur</Label>
            {counts.length ? <Select value={countId} onValueChange={(v) => { setCountId(v); reset(); }}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{counts.map((c) => <SelectItem key={c.id} value={c.id}>{c.count_no} · {c.warehouses?.name}</SelectItem>)}</SelectContent></Select>
              : <p className="text-xs text-muted-foreground">Keine laufende Inventur. Bitte zuerst unter Einkaufen & lagern → Inventur starten.</p>}
          </div>
        ) : (
          <div className="space-y-1"><Label className="text-xs">Lager</Label>
            <Select value={wh} onValueChange={(v) => { setWh(v); reset(); }}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
        <CameraScanner onScan={onScan} />
        {art && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div><p className="font-mono text-sm">{art.art_nr}</p><p className="text-xs text-muted-foreground">{art.bezeich_1}</p>
              <p className="text-xs mt-1">Bestand: <span className="tabular-nums">{onHand} {art.me}</span>{countItem && <> · Soll laut Inventur: {countItem.expected_qty}</>}</p></div>
            {mode === 'receipt' && lines.length > 0 && (
              <div className="space-y-1"><Label className="text-xs">Bestellung</Label>
                <Select value={lineId} onValueChange={setLineId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.po_no} · offen {l.open}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            <div className="space-y-1"><Label className="text-xs">{mode === 'count' ? 'Gezählte Menge' : 'Menge'}</Label>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 text-right text-lg" aria-label="Menge" /></div>
            {mode === 'receipt' && <><Input placeholder="Charge (optional)" value={lot} onChange={(e) => setLot(e.target.value)} className="h-11" /><Input placeholder="Lieferschein-Nr. (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" /></>}
            {mode === 'issue' && <Input placeholder="Verwendung / Notiz (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />}
            <Button className="w-full h-12" disabled={busy || !canBook || (mode === 'receipt' && !lineId) || (mode === 'count' && !countId)} onClick={() => book()}>
              {mode === 'receipt' ? 'Wareneingang buchen' : mode === 'issue' ? 'Entnahme buchen' : 'Zählmenge speichern'}
            </Button>
          </div>
        )}
        </>}
        <AlertDialog open={!!overAsk} onOpenChange={(o) => !o && setOverAsk(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Überlieferung</AlertDialogTitle>
              <AlertDialogDescription>Offen sind {overAsk?.open}, erfasst {overAsk?.qty}. Mehrmenge {overAsk ? Math.round((overAsk.qty - overAsk.open) * 1000) / 1000 : 0} akzeptieren oder abweisen? Beim Abweisen wird nur die offene Menge gebucht.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <Button variant="outline" disabled={!overAsk?.open} onClick={() => book('rejected')}>Abweisen</Button>
              <Button onClick={() => book('accepted')}>Akzeptieren</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
