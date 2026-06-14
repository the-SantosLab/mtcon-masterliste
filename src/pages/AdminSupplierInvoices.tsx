import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Plus, CheckCircle2, XCircle, Link2, Search } from "lucide-react";

type SI = {
  id: string; invoice_no: string; supplier_invoice_no: string | null;
  supplier_id: string | null; po_id: string | null; gr_id: string | null;
  status: 'open'|'matched'|'approved'|'rejected'|'booked';
  invoice_date: string | null; due_date: string | null; received_at: string;
  currency: string;
  subtotal_amount: number | null; tax_amount: number | null; total_amount: number | null;
  match_status: string | null; match_diff: number | null;
  notes: string | null; rejection_reason: string | null;
  approved_at: string | null; rejected_at: string | null; booked_at: string | null;
};
type SII = {
  id: string; invoice_id: string; po_item_id: string | null; position: number;
  art_nr: string | null; description: string; quantity: number; unit: string | null;
  unit_price: number | null; tax_rate: number | null; line_total: number | null;
  match_status: string | null;
};

const STATUS: Record<string,string> = { open:'Offen', matched:'Geprüft', approved:'Freigegeben', rejected:'Abgelehnt', booked:'Gebucht' };
const STATUS_COLOR: Record<string,string> = {
  open: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  matched: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  booked: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};
const MATCH_COLOR: Record<string,string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amount_diff: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  no_po: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  price_diff: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  qty_over_gr: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  unmatched: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export default function AdminSupplierInvoices() {
  const [rows, setRows] = useState<SI[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<SI | null>(null);
  const [items, setItems] = useState<SII[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [poSearch, setPoSearch] = useState('');
  const [poResults, setPoResults] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from('supplier_invoices' as any).select('*').order('received_at', { ascending: false }).limit(200)) as any;
    setRows((data as SI[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); (async () => {
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    setSuppliers(data || []);
  })(); }, []);

  const open = async (i: SI) => {
    setSel(i);
    const { data } = await (supabase.from('supplier_invoice_items' as any).select('*').eq('invoice_id', i.id).order('position')) as any;
    setItems((data as SII[]) || []);
  };

  const save = async () => {
    if (!sel) return;
    const { error } = await (supabase.from('supplier_invoices' as any).update({
      supplier_invoice_no: sel.supplier_invoice_no, supplier_id: sel.supplier_id,
      po_id: sel.po_id, gr_id: sel.gr_id,
      invoice_date: sel.invoice_date, due_date: sel.due_date,
      subtotal_amount: sel.subtotal_amount, tax_amount: sel.tax_amount, total_amount: sel.total_amount,
      notes: sel.notes,
    }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Gespeichert');
    await runMatch(sel.id);
  };

  const runMatch = async (id?: string) => {
    const _id = id || sel?.id; if (!_id) return;
    const { data, error } = await (supabase.rpc('match_supplier_invoice' as any, { _invoice_id: _id })) as any;
    if (error) return toast.error(error.message);
    toast.success(`Matching: ${data?.match_status || '—'} (Diff ${Number(data?.diff||0).toFixed(2)})`);
    await load();
    if (sel) {
      const { data: r } = await (supabase.from('supplier_invoices' as any).select('*').eq('id', _id).single()) as any;
      setSel(r);
      const { data: it } = await (supabase.from('supplier_invoice_items' as any).select('*').eq('invoice_id', _id).order('position')) as any;
      setItems(it || []);
    }
  };

  const approve = async (ok: boolean) => {
    if (!sel) return;
    let reason: string | null = null;
    if (!ok) {
      reason = prompt('Grund für Ablehnung?') || null;
      if (!reason) return;
    }
    const { error } = await (supabase.rpc('approve_supplier_invoice' as any, { _invoice_id: sel.id, _approve: ok, _reason: reason })) as any;
    if (error) return toast.error(error.message);
    toast.success(ok ? 'Freigegeben' : 'Abgelehnt');
    setSel(null); load();
  };

  const book = async () => {
    if (!sel) return;
    const { error } = await (supabase.from('supplier_invoices' as any).update({ status: 'booked', booked_at: new Date().toISOString() }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Gebucht');
    setSel(null); load();
  };

  const searchPo = async (q: string) => {
    setPoSearch(q);
    if (!q) { setPoResults([]); return; }
    const { data } = await (supabase.from('purchase_orders').select('id, po_no, supplier_id, suppliers(name)').or(`po_no.ilike.%${q}%`).limit(20)) as any;
    setPoResults(data || []);
  };

  const linkPo = async (po: any) => {
    if (!sel) return;
    // Copy PO items into invoice if none
    const { data: existing } = await (supabase.from('supplier_invoice_items' as any).select('id').eq('invoice_id', sel.id)) as any;
    if ((existing || []).length === 0) {
      const { data: poItems } = await supabase.from('purchase_order_items').select('*').eq('po_id', po.id).order('position');
      const toInsert = (poItems || []).map((it: any, idx: number) => ({
        invoice_id: sel.id, po_item_id: it.id, position: it.position || idx+1,
        art_nr: it.art_nr, description: it.description, quantity: Number(it.qty_ordered),
        unit_price: it.unit_price != null ? Number(it.unit_price) : null,
        tax_rate: 19,
        line_total: it.unit_price != null ? Number(it.qty_ordered) * Number(it.unit_price) : null,
      }));
      if (toInsert.length) await (supabase.from('supplier_invoice_items' as any).insert(toInsert)) as any;
    }
    await (supabase.from('supplier_invoices' as any).update({ po_id: po.id, supplier_id: po.supplier_id }).eq('id', sel.id)) as any;
    setSel({ ...sel, po_id: po.id, supplier_id: po.supplier_id });
    setPoResults([]); setPoSearch('');
    await runMatch(sel.id);
  };

  const filtered = useMemo(() => filter==='all' ? rows : rows.filter(r => r.status === filter), [rows, filter]);
  const totals = useMemo(() => {
    const open = rows.filter(r => r.status==='open' || r.status==='matched').reduce((s,r) => s + (Number(r.total_amount)||0), 0);
    const appr = rows.filter(r => r.status==='approved').reduce((s,r) => s + (Number(r.total_amount)||0), 0);
    return { open, appr };
  }, [rows]);

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> Eingangsrechnungen</h1>
            <p className="text-sm text-muted-foreground mt-1">Inbox, 3-Wege-Matching gegen Bestellung und Wareneingang, Freigabe-Workflow.</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Neue Eingangsrechnung</Button>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Offen / Geprüft</div><div className="text-lg tabular-nums">{totals.open.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div></Card>
          <Card className="p-3"><div className="text-[10px] uppercase text-muted-foreground">Freigegeben</div><div className="text-lg tabular-nums">{totals.appr.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div></Card>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all','open','matched','approved','rejected','booked'].map(s => (
            <Button key={s} size="sm" variant={filter===s?'default':'outline'} onClick={() => setFilter(s)} className="text-xs">
              {s==='all'?'Alle':STATUS[s]}
            </Button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Nr.</th>
                <th className="text-left p-3 font-medium">LF-Nr.</th>
                <th className="text-left p-3 font-medium">Lieferant</th>
                <th className="text-left p-3 font-medium">PO</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Matching</th>
                <th className="text-right p-3 font-medium">Summe</th>
                <th className="text-right p-3 font-medium">Diff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
              : filtered.length===0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Keine Eingangsrechnungen</td></tr>
              : filtered.map(r => (
                <tr key={r.id} onClick={() => open(r)} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer">
                  <td className="p-3 font-mono text-xs">{r.invoice_no}</td>
                  <td className="p-3 font-mono text-xs">{r.supplier_invoice_no || '—'}</td>
                  <td className="p-3">{suppliers.find(s => s.id===r.supplier_id)?.name || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.po_id ? '✓' : '—'}</td>
                  <td className="p-3"><Badge variant="outline" className={STATUS_COLOR[r.status]}>{STATUS[r.status]}</Badge></td>
                  <td className="p-3">{r.match_status ? <Badge variant="outline" className={MATCH_COLOR[r.match_status] || ''}>{r.match_status}</Badge> : '—'}</td>
                  <td className="p-3 text-right tabular-nums">{r.total_amount != null ? `${Number(r.total_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${r.currency}` : '—'}</td>
                  <td className={`p-3 text-right tabular-nums ${Math.abs(Number(r.match_diff||0)) > 0.5 ? 'text-amber-400' : 'text-muted-foreground'}`}>{r.match_diff != null ? Number(r.match_diff).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); load().then(async () => {
          const { data } = await (supabase.from('supplier_invoices' as any).select('*').eq('id', id).single()) as any;
          if (data) open(data);
        }); }} suppliers={suppliers} />

        <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono">{sel?.invoice_no}</span>
                {sel && <Badge variant="outline" className={STATUS_COLOR[sel.status]}>{STATUS[sel.status]}</Badge>}
                {sel?.match_status && <Badge variant="outline" className={MATCH_COLOR[sel.match_status] || ''}>{sel.match_status}</Badge>}
              </DialogTitle>
            </DialogHeader>
            {sel && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Lieferanten-Rechnungsnr.</Label><Input value={sel.supplier_invoice_no || ''} onChange={e => setSel({...sel, supplier_invoice_no: e.target.value})} /></div>
                  <div><Label className="text-xs">Lieferant</Label>
                    <Select value={sel.supplier_id || ''} onValueChange={v => setSel({...sel, supplier_id: v || null})}>
                      <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                      <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Rechnungsdatum</Label><Input type="date" value={sel.invoice_date || ''} onChange={e => setSel({...sel, invoice_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Fälligkeit</Label><Input type="date" value={sel.due_date || ''} onChange={e => setSel({...sel, due_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Zwischensumme</Label><Input type="number" step="0.01" value={sel.subtotal_amount ?? ''} onChange={e => setSel({...sel, subtotal_amount: e.target.value === '' ? null : Number(e.target.value)})} /></div>
                  <div><Label className="text-xs">USt.</Label><Input type="number" step="0.01" value={sel.tax_amount ?? ''} onChange={e => setSel({...sel, tax_amount: e.target.value === '' ? null : Number(e.target.value)})} /></div>
                  <div><Label className="text-xs">Gesamt</Label><Input type="number" step="0.01" value={sel.total_amount ?? ''} onChange={e => setSel({...sel, total_amount: e.target.value === '' ? null : Number(e.target.value)})} /></div>
                  <div><Label className="text-xs">Währung</Label><Input value={sel.currency} disabled /></div>
                </div>

                <div className="border border-border/40 rounded p-3 space-y-2">
                  <Label className="text-xs flex items-center gap-1"><Link2 className="h-3 w-3" /> Bestellung verknüpfen</Label>
                  {sel.po_id ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">PO verknüpft ({sel.po_id.slice(0,8)}…)</span>
                      <Button size="sm" variant="ghost" onClick={() => setSel({...sel, po_id: null})}>Trennen</Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="h-3 w-3 absolute left-2 top-2.5 text-muted-foreground" />
                        <Input className="pl-7 text-xs h-8" placeholder="PO-Nummer suchen…" value={poSearch} onChange={e => searchPo(e.target.value)} />
                      </div>
                      {poResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border border-border/40 rounded">
                          {poResults.map((p: any) => (
                            <button key={p.id} onClick={() => linkPo(p)} className="w-full text-left p-2 text-xs hover:bg-muted/30 border-b border-border/30 last:border-0">
                              <div className="font-mono">{p.po_no}</div>
                              <div className="text-muted-foreground">{p.suppliers?.name || '—'}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Positionen</Label>
                    <Button size="sm" variant="outline" onClick={() => runMatch()} className="h-7 text-xs">Erneut matchen</Button>
                  </div>
                  <Card className="overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">#</th><th className="text-left p-2">Artikel</th><th className="text-left p-2">Bezeichnung</th>
                          <th className="text-right p-2">Menge</th><th className="text-right p-2">EP</th><th className="text-right p-2">Summe</th>
                          <th className="text-left p-2">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Keine Positionen — über PO verknüpfen lädt sie automatisch.</td></tr>
                        : items.map(it => (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="p-2">{it.position}</td>
                            <td className="p-2 font-mono">{it.art_nr || '—'}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right tabular-nums">{it.quantity} {it.unit || ''}</td>
                            <td className="p-2 text-right tabular-nums">{it.unit_price?.toFixed(2) ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{it.line_total?.toFixed(2) ?? '—'}</td>
                            <td className="p-2">{it.match_status ? <Badge variant="outline" className={MATCH_COLOR[it.match_status] || ''}>{it.match_status}</Badge> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>

                <div><Label className="text-xs">Notizen</Label><Textarea rows={2} value={sel.notes || ''} onChange={e => setSel({...sel, notes: e.target.value})} /></div>

                {sel.rejection_reason && (
                  <div className="text-xs text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded p-2">
                    <span className="font-medium">Ablehnungsgrund:</span> {sel.rejection_reason}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSel(null)}>Schließen</Button>
              <Button onClick={save}>Speichern + Matchen</Button>
              {sel && (sel.status === 'open' || sel.status === 'matched') && (
                <>
                  <Button variant="destructive" onClick={() => approve(false)}><XCircle className="h-4 w-4 mr-1" /> Ablehnen</Button>
                  <Button onClick={() => approve(true)}><CheckCircle2 className="h-4 w-4 mr-1" /> Freigeben</Button>
                </>
              )}
              {sel?.status === 'approved' && <Button onClick={book}>Buchen</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function CreateDialog({ open, onClose, onCreated, suppliers }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; suppliers: any[] }) {
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [total, setTotal] = useState('');
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0,10));
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setSupplierId(''); setSupplierInvNo(''); setTotal(''); setInvDate(new Date().toISOString().slice(0,10)); } }, [open]);

  const create = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const t = total ? Number(total) : null;
    const tax = t != null ? +(t - t / 1.19).toFixed(2) : null;
    const sub = t != null && tax != null ? +(t - tax).toFixed(2) : null;
    const { data, error } = await (supabase.from('supplier_invoices' as any).insert({
      supplier_id: supplierId || null,
      supplier_invoice_no: supplierInvNo || null,
      invoice_date: invDate,
      total_amount: t, subtotal_amount: sub, tax_amount: tax,
      created_by: user?.id ?? null,
    }).select().single()) as any;
    setBusy(false);
    if (error || !data) return toast.error(error?.message || 'Fehler');
    toast.success(`Eingangsrechnung ${data.invoice_no} angelegt`);
    onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Neue Eingangsrechnung</DialogTitle><DialogDescription>Anschließend PO verknüpfen für 3-Wege-Matching.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Lieferant</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Lieferanten-Rechnungsnr.</Label><Input value={supplierInvNo} onChange={e => setSupplierInvNo(e.target.value)} /></div>
          <div><Label className="text-xs">Rechnungsdatum</Label><Input type="date" value={invDate} onChange={e => setInvDate(e.target.value)} /></div>
          <div><Label className="text-xs">Bruttosumme (€)</Label><Input type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} placeholder="USt. wird mit 19 % gerechnet" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={create} disabled={busy}>{busy ? 'Anlegen…' : 'Anlegen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
