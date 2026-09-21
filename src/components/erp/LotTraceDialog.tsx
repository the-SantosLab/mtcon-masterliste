import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Download, PackagePlus, ArrowLeftRight, Truck } from 'lucide-react';
import { toast } from 'sonner';

export type TraceLot = {
  id: string;
  art_nr: string;
  lot_no: string;
  lot_no_ext: string | null;
  supplier_name: string | null;
  supplier_lief_nr: string | null;
  expiry_date: string | null;
  current_qty: number;
  total_received: number;
  status: string;
};

type Receipt = {
  qty: number;
  gr_no: string | null;
  received_at: string | null;
  delivery_note_no: string | null;
  po_no: string | null;
};
type Movement = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  note: string | null;
  reference_type: string | null;
};
type Shipment = {
  id: string;
  quantity: number;
  delivery_no: string | null;
  delivery_date: string | null;
  ship_to: string | null;
  status: string | null;
};

const fmtN = (n: number | null | undefined, d = 3) =>
  n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const fmtDT = (d: string | null) =>
  d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';

const MOVEMENT_LABEL: Record<string, string> = {
  in: 'Zugang',
  out: 'Abgang',
  transfer: 'Umlagerung',
  adjust: 'Korrektur',
  reserve: 'Reservierung',
  release: 'Freigabe',
};

export function LotTraceDialog({ lot, onClose }: { lot: TraceLot | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    if (!lot) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setReceipts([]); setMovements([]); setShipments([]);
      try {
        const sb = supabase as any;
        const [gr, mv, dl] = await Promise.all([
          sb.from('goods_receipt_items')
            .select('qty_received, created_at, goods_receipts(gr_no, received_at, delivery_note_no, purchase_orders(po_no))')
            .eq('lot_id', lot.id)
            .order('created_at', { ascending: false }),
          sb.from('stock_movements')
            .select('id, created_at, movement_type, quantity, note, reference_type')
            .eq('art_nr', lot.art_nr)
            .eq('lot_no', lot.lot_no)
            .order('created_at', { ascending: false })
            .limit(300),
          sb.from('delivery_items')
            .select('id, quantity, deliveries(delivery_no, delivery_date, ship_to, status)')
            .eq('art_nr', lot.art_nr)
            .eq('lot_no', lot.lot_no)
            .order('created_at', { ascending: false })
            .limit(300),
        ]);
        if (cancelled) return;
        setReceipts(((gr.data || []) as any[]).map((r) => ({
          qty: Number(r.qty_received || 0),
          gr_no: r.goods_receipts?.gr_no ?? null,
          received_at: r.goods_receipts?.received_at ?? r.created_at ?? null,
          delivery_note_no: r.goods_receipts?.delivery_note_no ?? null,
          po_no: r.goods_receipts?.purchase_orders?.po_no ?? null,
        })));
        setMovements(((mv.data || []) as any[]).map((m) => ({
          id: m.id, created_at: m.created_at, movement_type: m.movement_type,
          quantity: Number(m.quantity || 0), note: m.note, reference_type: m.reference_type,
        })));
        setShipments(((dl.data || []) as any[]).map((d) => ({
          id: d.id,
          quantity: Number(d.quantity || 0),
          delivery_no: d.deliveries?.delivery_no ?? null,
          delivery_date: d.deliveries?.delivery_date ?? null,
          ship_to: d.deliveries?.ship_to ?? null,
          status: d.deliveries?.status ?? null,
        })));
      } catch {
        if (!cancelled) toast.error('Rückverfolgung konnte nicht geladen werden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lot]);

  const exportCsv = () => {
    if (!lot) return;
    const sep = ';';
    const lines: string[] = [];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    lines.push(['Charge', lot.lot_no, 'Artikel', lot.art_nr].map(esc).join(sep));
    lines.push('');
    lines.push(['Wareneingang', 'Datum', 'WE-Nr', 'Bestell-Nr', 'Lieferschein', 'Menge'].map(esc).join(sep));
    receipts.forEach(r => lines.push(['', fmtDT(r.received_at), r.gr_no, r.po_no, r.delivery_note_no, fmtN(r.qty)].map(esc).join(sep)));
    lines.push('');
    lines.push(['Bewegung', 'Datum', 'Art', 'Menge', 'Referenz', 'Notiz'].map(esc).join(sep));
    movements.forEach(m => lines.push(['', fmtDT(m.created_at), MOVEMENT_LABEL[m.movement_type] || m.movement_type, fmtN(m.quantity), m.reference_type, m.note].map(esc).join(sep)));
    lines.push('');
    lines.push(['Auslieferung', 'Datum', 'Lieferschein', 'Empfänger', 'Status', 'Menge'].map(esc).join(sep));
    shipments.forEach(s => lines.push(['', fmtD(s.delivery_date), s.delivery_no, s.ship_to, s.status, fmtN(s.quantity)].map(esc).join(sep)));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rueckverfolgung_${lot.art_nr}_${lot.lot_no}.csv`.replace(/[^\w.\-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!lot} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Rückverfolgung Charge <span className="font-mono">{lot?.lot_no}</span>
            <span className="text-muted-foreground font-normal"> · Artikel {lot?.art_nr}</span>
          </DialogTitle>
        </DialogHeader>

        {lot && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Field label="Lieferant" value={lot.supplier_name || lot.supplier_lief_nr || '–'} />
              <Field label="Ext. Charge" value={lot.lot_no_ext || '–'} />
              <Field label="MHD" value={fmtD(lot.expiry_date)} />
              <Field label="Bestand / Σ Zugang" value={`${fmtN(lot.current_qty)} / ${fmtN(lot.total_received)}`} />
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={lot.status === 'blocked' ? 'destructive' : lot.status === 'consumed' ? 'secondary' : 'outline'} className="text-[10px] h-4 px-1.5">
                {lot.status === 'active' ? 'Aktiv' : lot.status === 'blocked' ? 'Gesperrt' : 'Verbraucht'}
              </Badge>
              <span className="text-muted-foreground">{loading ? 'Lade Rückverfolgung…' : `${receipts.length} Eingänge · ${movements.length} Bewegungen · ${shipments.length} Auslieferungen`}</span>
              <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto" onClick={exportCsv} disabled={loading}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
              </Button>
            </div>

            <Section icon={<PackagePlus className="h-3.5 w-3.5 text-emerald-500" />} title="Herkunft · Wareneingänge">
              <Table head={['Datum', 'WE-Nr', 'Bestell-Nr', 'Lieferschein', 'Menge']}
                rows={receipts.map(r => [fmtDT(r.received_at), r.gr_no || '–', r.po_no || '–', r.delivery_note_no || '–', fmtN(r.qty)])} />
            </Section>

            <Section icon={<ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />} title="Lagerbewegungen">
              <Table head={['Datum', 'Art', 'Menge', 'Referenz', 'Notiz']}
                rows={movements.map(m => [fmtDT(m.created_at), MOVEMENT_LABEL[m.movement_type] || m.movement_type, fmtN(m.quantity), m.reference_type || '–', m.note || '–'])} />
            </Section>

            <Section icon={<Truck className="h-3.5 w-3.5 text-sky-500" />} title="Verwendung · Auslieferungen">
              <Table head={['Datum', 'Lieferschein', 'Empfänger', 'Status', 'Menge']}
                rows={shipments.map(s => [fmtD(s.delivery_date), s.delivery_no || '–', s.ship_to || '–', s.status || '–', fmtN(s.quantity)])} />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">{icon}{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>{head.map((h, i) => <th key={h} className={`px-2 py-1.5 ${i === head.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-2 py-4 text-center text-muted-foreground">Keine Einträge</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j} className={`px-2 py-1 ${j === r.length - 1 ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
