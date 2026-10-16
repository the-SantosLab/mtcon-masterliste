import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { ProcurementHeader } from '@/components/erp/ProcurementHeader';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { INSPECTION_STATUS, inspectionStage, type InspectionStatus } from '@/lib/goodsInspection';

const db = supabase as any;
type Row = {
  id: string; art_nr: string; qty: number; lot_no: string | null; status: InspectionStatus; note: string | null;
  over_qty: number; over_decision: string | null; case_id: string | null; warehouse_id: string; created_at: string;
  stored_location_id: string | null; planned_location_id: string | null; warehouses?: { code: string } | null; cases?: { case_no: string } | null;
  goods_receipts?: { gr_no: string | null; purchase_orders?: { po_no: string | null } | null } | null;
};
type Loc = { id: string; code: string; lager: string; is_blocked: boolean };
type Action = { row: Row; kind: 'release' | 'defect' | 'store' | 'return' };

const fmt = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });

export default function GoodsInspection() {
  const { isAdmin, role } = useAuth();
  const canBook = isAdmin || role === 'staff';
  const [rows, setRows] = useState<Row[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'check' | 'store' | 'defect' | 'done'>('check');
  const [act, setAct] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db.from('goods_inspections')
      .select('*, warehouses:warehouse_id(code), cases:case_id(case_no), goods_receipts:gr_id(gr_no, purchase_orders:po_id(po_no))')
      .order('created_at', { ascending: false }).limit(300);
    if (error) toast.error(error.message);
    setRows(data ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byStage = useMemo(() => rows.filter((r) => inspectionStage(r.status) === tab), [rows, tab]);
  const count = (s: string) => rows.filter((r) => inspectionStage(r.status) === s).length;

  const open = async (row: Row, kind: Action['kind']) => {
    setAct({ row, kind }); setNote(''); setLoc(kind === 'store' && row.status === 'released' ? row.planned_location_id ?? '' : '');
    if (kind === 'store') {
      const { data } = await db.from('storage_locations').select('id, code, lager, is_blocked, lagerpl')
        .eq('lager', row.warehouses?.code ?? '').neq('lagerpl', 'I-PUNKT').order('code').limit(1000);
      setLocs((data ?? []).filter((l: Loc) => row.status === 'defect' || !l.is_blocked));
    }
  };

  const run = async () => {
    if (!act) return;
    setBusy(true);
    const { row, kind } = act;
    const { error } = kind === 'release' ? await db.rpc('decide_goods_inspection', { _id: row.id, _ok: true, _note: note || null })
      : kind === 'defect' ? await db.rpc('decide_goods_inspection', { _id: row.id, _ok: false, _note: note })
      : kind === 'store' ? await db.rpc('store_goods_inspection', { _id: row.id, _location_id: loc })
      : await db.rpc('return_goods_inspection', { _id: row.id, _note: note || null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success({ release: 'Freigegeben – Lager wurde benachrichtigt', defect: 'Als fehlerhaft gesperrt', store: 'Eingelagert', return: 'Rücksendung gebucht' }[kind]);
    setAct(null); load();
  };

  const title = act && { release: 'Freigeben', defect: 'Als fehlerhaft melden', store: 'Einlagern', return: 'Rücksendung buchen' }[act.kind];

  return (
    <AppLayout>
      <div className="procurement-page fulfillment-page">
        <ProcurementHeader title="Wareneingangsprüfung" subtitle="i-Punkt · Prüfung durch QS/QM · Einlagern · Rücksendung" />
        <FulfillmentMetrics loading={loading} metrics={[
          { label: 'Am i-Punkt zu prüfen', value: count('check') },
          { label: 'Freigegeben, einzulagern', value: count('store') },
          { label: 'Fehlerhaft bis Rücksendung', value: count('defect') },
          { label: 'Abgeschlossen', value: count('done') },
        ]} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="check">Prüfen ({count('check')})</TabsTrigger>
            <TabsTrigger value="store">Einlagern ({count('store')})</TabsTrigger>
            <TabsTrigger value="defect">Fehlerhaft ({count('defect')})</TabsTrigger>
            <TabsTrigger value="done">Erledigt</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="fulfillment-table">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs">
              <th className="px-3 py-2">Artikel</th><th className="px-3 py-2 text-right">Menge</th><th className="px-3 py-2">Charge</th>
              <th className="px-3 py-2">Bestellung / WE</th><th className="px-3 py-2">Vorgang</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {byStage.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 font-mono">{r.art_nr}<div className="text-[11px] text-muted-foreground font-sans">{r.warehouses?.code} · {new Date(r.created_at).toLocaleDateString('de-DE')}</div></td>
                  <td className="px-3 text-right tabular-nums">{fmt(r.qty)}
                    {r.over_qty > 0 && <div className="text-[11px] text-muted-foreground">Überlieferung {fmt(r.over_qty)} {r.over_decision === 'accepted' ? 'akzeptiert' : 'abgewiesen'}</div>}</td>
                  <td className="px-3">{r.lot_no ?? '—'}</td>
                  <td className="px-3 text-xs">{r.goods_receipts?.purchase_orders?.po_no ?? '—'}<div className="text-muted-foreground">{r.goods_receipts?.gr_no}</div></td>
                  <td className="px-3 text-xs">{r.case_id ? <Link className="text-primary hover:underline" to={`/cases/${r.case_id}`}>{r.cases?.case_no ?? 'Vorgang'}</Link> : '—'}</td>
                  <td className="px-3"><Badge variant={r.status === 'defect' || r.status === 'defect_stored' ? 'destructive' : 'secondary'}>{INSPECTION_STATUS[r.status]}</Badge>
                    {r.note && <div className="mt-1 max-w-[240px] text-[11px] text-muted-foreground whitespace-pre-line">{r.note}</div>}</td>
                  <td className="px-3 text-right whitespace-nowrap space-x-1">
                    {r.status === 'pending' && <><Button size="sm" disabled={!canBook} onClick={() => open(r, 'release')}>Freigeben</Button>
                      <Button size="sm" variant="outline" disabled={!canBook} onClick={() => open(r, 'defect')}>Fehlerhaft</Button></>}
                    {(r.status === 'released' || r.status === 'defect') && <Button size="sm" variant={r.status === 'released' ? 'default' : 'outline'} disabled={!canBook} onClick={() => open(r, 'store')}>Einlagern</Button>}
                    {(r.status === 'defect' || r.status === 'defect_stored') && <Button size="sm" variant="outline" disabled={!canBook} onClick={() => open(r, 'return')}>Rücksendung</Button>}
                  </td>
                </tr>
              ))}
              {!loading && !byStage.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">Keine Einträge</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!act} onOpenChange={(o) => !o && setAct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{act?.row.art_nr} · {act && fmt(act.row.qty)}{act?.row.lot_no ? ` · Charge ${act.row.lot_no}` : ''}</DialogDescription>
          </DialogHeader>
          {act?.kind === 'store' ? (
            <div className="space-y-1">
              <Label className="text-xs">Lagerplatz</Label>
              <Select value={loc} onValueChange={setLoc}><SelectTrigger><SelectValue placeholder="Lagerplatz wählen" /></SelectTrigger>
                <SelectContent>{locs.map((l) => <SelectItem key={l.id} value={l.id}>{l.code}{l.is_blocked ? ' (Sperrplatz)' : ''}</SelectItem>)}</SelectContent></Select>
              {act.row.status === 'defect' && <p className="text-[11px] text-muted-foreground">Fehlerhafte Ware bleibt bis zur Rücksendung als fehlerhaft gekennzeichnet.</p>}
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">{act?.kind === 'defect' ? 'Mangel (Pflicht)' : 'Notiz (optional)'}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAct(null)}>Abbrechen</Button>
            <Button disabled={busy || (act?.kind === 'store' && !loc) || (act?.kind === 'defect' && !note.trim())} onClick={run}>{title}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
