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
import { Receipt, Plus, FlaskConical, FileCode, Ban, RotateCcw, Wallet } from "lucide-react";
import { ErpDocPdfButton } from "@/components/ErpDocPdfButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IssosInvoicesTab } from "@/components/IssosInvoicesTab";
import { InvoiceDemoDialog } from "@/components/InvoiceDemoDialog";

type Invoice = {
  id: string;
  invoice_no: string;
  order_id: string | null;
  delivery_id: string | null;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  payment_status: 'open' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  doc_kind: 'invoice' | 'credit_note' | 'storno';
  invoice_date: string | null;
  due_date: string | null;
  payment_terms_days: number;
  skonto_percent: number | null;
  skonto_days: number | null;
  tax_mode: 'standard' | 'reverse_charge' | 'tax_free_eu' | 'tax_free_third_country' | 'small_business';
  storno_of_invoice_id: string | null;
  credit_note_of_invoice_id: string | null;
  locked: boolean;
  customer_name: string | null;
  customer_email: string | null;
  customer_no: string | null;
  billing_address: string | null;
  currency: string;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  paid_amount: number;
  paid_at: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
};
type InvItem = {
  id: string; invoice_id: string; position: number; art_nr: string | null;
  description: string; quantity: number; unit: string | null;
  unit_price: number | null; tax_rate: number | null; line_total: number | null;
};
type Payment = { id: string; amount: number; paid_on: string; method: string | null; reference: string | null; note: string | null; created_at: string; };

const STATUS: Record<string,string> = { draft:'Entwurf', sent:'Versendet', paid:'Bezahlt', cancelled:'Storniert' };
const PAY_STATUS: Record<string,string> = { open:'Offen', partial:'Teilbezahlt', paid:'Bezahlt', overdue:'Überfällig', cancelled:'Storniert' };
const PAY_COLOR: Record<string,string> = {
  open: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  partial: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  overdue: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  cancelled: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
};
const KIND: Record<string,string> = { invoice:'Rechnung', credit_note:'Gutschrift', storno:'Storno' };
const TAX_MODE: Record<string,string> = {
  standard: 'Standard (19/7%)',
  reverse_charge: 'Reverse Charge (§ 13b UStG)',
  tax_free_eu: 'EU-innergemeinschaftl. Lieferung',
  tax_free_third_country: 'Ausfuhrlieferung Drittland',
  small_business: 'Kleinunternehmer (§ 19)',
};

const currencyDe = (v: number | string | null | undefined, cur = 'EUR') =>
  `${Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

export default function AdminInvoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payFilter, setPayFilter] = useState<string>('all');
  const [sel, setSel] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState<'storno' | 'credit_note' | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from('invoices' as any).select('*').order('created_at', { ascending: false }).limit(400)) as any;
    setRows((data as Invoice[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Deep-Link-Filter, z.B. /rechnungen?payment=overdue (Big-7 KPI Drill-down)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('payment');
    if (p) setPayFilter(p);
  }, []);

  const open = async (i: Invoice) => {
    setSel(i);
    const [{ data: itemsData }, { data: payData }] = await Promise.all([
      (supabase.from('invoice_items' as any).select('*').eq('invoice_id', i.id).order('position')) as any,
      (supabase.from('invoice_payments' as any).select('*').eq('invoice_id', i.id).order('paid_on', { ascending: false })) as any,
    ]);
    setItems((itemsData as InvItem[]) || []);
    setPayments((payData as Payment[]) || []);
  };
  const reopen = async () => { if (sel) { const cur = rows.find(r => r.id === sel.id); if (cur) open(cur); } };

  const save = async () => {
    if (!sel) return;
    if (sel.locked) return toast.error('Beleg ist gesperrt.');
    const { error } = await (supabase.from('invoices' as any).update({
      status: sel.status, invoice_date: sel.invoice_date, due_date: sel.due_date,
      customer_name: sel.customer_name, customer_email: sel.customer_email, customer_no: sel.customer_no,
      billing_address: sel.billing_address, payment_terms: sel.payment_terms,
      payment_terms_days: sel.payment_terms_days, skonto_percent: sel.skonto_percent, skonto_days: sel.skonto_days,
      tax_mode: sel.tax_mode, notes: sel.notes,
    }).eq('id', sel.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Gespeichert');
    setSel(null); load();
  };

  const downloadXRechnung = async () => {
    if (!sel) return;
    const { data, error } = await supabase.functions.invoke('generate-xrechnung', { body: { invoice_id: sel.id } });
    if (error) return toast.error(error.message);
    const { xml, filename } = data as { xml: string; filename: string };
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success('XRechnung erzeugt');
  };

  const filtered = useMemo(() => {
    if (payFilter === 'all') return rows;
    return rows.filter(r => (r.payment_status ?? 'open') === payFilter);
  }, [rows, payFilter]);

  const totals = useMemo(() => {
    const openSum = rows.filter(r => r.payment_status === 'open' || r.payment_status === 'partial')
      .reduce((s,r) => s + Math.max(0, (Number(r.total_amount)||0) - Number(r.paid_amount||0)), 0);
    const overdueSum = rows.filter(r => r.payment_status === 'overdue')
      .reduce((s,r) => s + Math.max(0, (Number(r.total_amount)||0) - Number(r.paid_amount||0)), 0);
    const paidSum = rows.filter(r => r.payment_status === 'paid').reduce((s,r) => s + (Number(r.total_amount)||0), 0);
    return { openSum, overdueSum, paidSum };
  }, [rows]);

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> Rechnungen</h1>
            <p className="text-sm text-muted-foreground mt-1">Ausgangsrechnungen, Gutschriften, Stornos — inkl. offener Posten und XRechnung-Export.</p>
          </div>
        </div>

        <Tabs defaultValue="outgoing" className="space-y-4">
          <TabsList>
            <TabsTrigger value="outgoing">Ausgangsrechnungen</TabsTrigger>
            <TabsTrigger value="issos">ISSOS-Rechnungen</TabsTrigger>
          </TabsList>

          <TabsContent value="outgoing" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDemoOpen(true)}>
                <FlaskConical className="h-4 w-4 mr-1" /> Demo-PDF
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Neue Rechnung</Button>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-2xl">
              <Card className="p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Offene Posten</div>
                <div className="text-lg tabular-nums">{currencyDe(totals.openSum)}</div>
              </Card>
              <Card className="p-3 border-rose-500/30">
                <div className="text-[10px] uppercase text-rose-400">Überfällig</div>
                <div className="text-lg tabular-nums text-rose-400">{currencyDe(totals.overdueSum)}</div>
              </Card>
              <Card className="p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Bezahlt (gesamt)</div>
                <div className="text-lg tabular-nums">{currencyDe(totals.paidSum)}</div>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2">
              {['all','open','partial','overdue','paid','cancelled'].map(s => (
                <Button key={s} size="sm" variant={payFilter===s?'default':'outline'} onClick={() => setPayFilter(s)} className="text-xs">
                  {s==='all' ? 'Alle' : PAY_STATUS[s]}
                </Button>
              ))}
            </div>

            <Card className="overflow-hidden">
              <div className="max-h-[calc(100vh-360px)] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 backdrop-blur text-[11px] uppercase text-muted-foreground sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3 font-medium">Nr.</th>
                      <th className="text-left p-3 font-medium">Art</th>
                      <th className="text-left p-3 font-medium">Zahlungsstatus</th>
                      <th className="text-left p-3 font-medium">Kunde</th>
                      <th className="text-left p-3 font-medium">Datum</th>
                      <th className="text-left p-3 font-medium">Fällig</th>
                      <th className="text-right p-3 font-medium">Summe</th>
                      <th className="text-right p-3 font-medium">Bezahlt</th>
                      <th className="text-right p-3 font-medium">Offen</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
                    : filtered.length===0 ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Keine Rechnungen</td></tr>
                    : filtered.map(r => {
                      const totalN = Number(r.total_amount || 0);
                      const paidN = Number(r.paid_amount || 0);
                      const open = Math.max(0, totalN - paidN);
                      return (
                        <tr key={r.id} onClick={() => open ? void 0 : null} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer" onClickCapture={() => open ? null : null}>
                          <td className="p-3 font-mono text-xs" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{r.invoice_no}</td>
                          <td className="p-3 text-xs" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{KIND[r.doc_kind] || 'Rechnung'}</td>
                          <td className="p-3" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>
                            <Badge variant="outline" className={PAY_COLOR[r.payment_status] || PAY_COLOR.open}>{PAY_STATUS[r.payment_status] || 'Offen'}</Badge>
                          </td>
                          <td className="p-3" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{r.customer_name || '—'}</td>
                          <td className="p-3" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{r.invoice_date || '—'}</td>
                          <td className="p-3" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{r.due_date || '—'}</td>
                          <td className="p-3 text-right tabular-nums" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{currencyDe(totalN, r.currency)}</td>
                          <td className="p-3 text-right tabular-nums text-emerald-400" onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{currencyDe(paidN, r.currency)}</td>
                          <td className={`p-3 text-right tabular-nums ${open > 0 && r.payment_status !== 'cancelled' ? 'text-amber-400' : 'text-muted-foreground'}`} onClick={(e) => { e.stopPropagation(); void openInvoice(r, setSel, setItems, setPayments); }}>{currencyDe(open, r.currency)}</td>
                          <td className="p-1 text-right" onClick={(e) => e.stopPropagation()}><ErpDocPdfButton type="rechnung" id={r.id} iconOnly variant="ghost" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="issos">
            <IssosInvoicesTab />
          </TabsContent>
        </Tabs>

        <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
        <InvoiceDemoDialog open={demoOpen} onClose={() => setDemoOpen(false)} />

        <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono">{sel?.invoice_no}</span>
                {sel && <Badge variant="outline" className={PAY_COLOR[sel.payment_status] || PAY_COLOR.open}>{PAY_STATUS[sel.payment_status] || 'Offen'}</Badge>}
                {sel && sel.doc_kind !== 'invoice' && <Badge variant="outline">{KIND[sel.doc_kind]}</Badge>}
                {sel?.locked && <Badge variant="outline" className="border-amber-500/30 text-amber-400">Gesperrt</Badge>}
              </DialogTitle>
            </DialogHeader>
            {sel && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label className="text-xs">Kunde</Label><Input value={sel.customer_name || ''} onChange={e => setSel({...sel, customer_name: e.target.value})} /></div>
                  <div><Label className="text-xs">Kunden-Nr.</Label><Input value={sel.customer_no || ''} onChange={e => setSel({...sel, customer_no: e.target.value})} /></div>
                  <div><Label className="text-xs">E-Mail</Label><Input value={sel.customer_email || ''} onChange={e => setSel({...sel, customer_email: e.target.value})} /></div>
                  <div><Label className="text-xs">Rechnungsdatum</Label><Input type="date" value={sel.invoice_date || ''} onChange={e => setSel({...sel, invoice_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Fälligkeit</Label><Input type="date" value={sel.due_date || ''} onChange={e => setSel({...sel, due_date: e.target.value || null})} /></div>
                  <div><Label className="text-xs">Zahlungsziel (Tage)</Label><Input type="number" value={sel.payment_terms_days ?? 14} onChange={e => setSel({...sel, payment_terms_days: Number(e.target.value)})} /></div>
                  <div><Label className="text-xs">Skonto %</Label><Input type="number" step="0.01" value={sel.skonto_percent ?? ''} onChange={e => setSel({...sel, skonto_percent: e.target.value ? Number(e.target.value) : null})} /></div>
                  <div><Label className="text-xs">Skonto Tage</Label><Input type="number" value={sel.skonto_days ?? ''} onChange={e => setSel({...sel, skonto_days: e.target.value ? Number(e.target.value) : null})} /></div>
                  <div className="col-span-3">
                    <Label className="text-xs">Steuermodus</Label>
                    <Select value={sel.tax_mode} onValueChange={(v: any) => setSel({...sel, tax_mode: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(TAX_MODE).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3"><Label className="text-xs">Rechnungsadresse</Label><Textarea rows={3} value={sel.billing_address || ''} onChange={e => setSel({...sel, billing_address: e.target.value})} /></div>
                </div>

                <div>
                  <Label className="text-xs">Positionen</Label>
                  <Card className="mt-1 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr><th className="text-left p-2">#</th><th className="text-left p-2">Artikel</th><th className="text-left p-2">Bezeichnung</th><th className="text-right p-2">Menge</th><th className="text-right p-2">EP</th><th className="text-right p-2">USt%</th><th className="text-right p-2">Summe</th></tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Keine Positionen</td></tr>
                        : items.map(it => (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="p-2">{it.position}</td>
                            <td className="p-2 font-mono">{it.art_nr || '—'}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right tabular-nums">{it.quantity} {it.unit || ''}</td>
                            <td className="p-2 text-right tabular-nums">{it.unit_price?.toFixed(2) ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{it.tax_rate ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums">{it.line_total?.toFixed(2) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/20 text-xs">
                        <tr className="border-t border-border"><td colSpan={6} className="p-2 text-right text-muted-foreground">Zwischensumme</td><td className="p-2 text-right tabular-nums">{Number(sel.subtotal_amount||0).toFixed(2)}</td></tr>
                        <tr><td colSpan={6} className="p-2 text-right text-muted-foreground">USt.</td><td className="p-2 text-right tabular-nums">{Number(sel.tax_amount||0).toFixed(2)}</td></tr>
                        <tr><td colSpan={6} className="p-2 text-right font-medium">Gesamt</td><td className="p-2 text-right tabular-nums font-medium">{currencyDe(sel.total_amount, sel.currency)}</td></tr>
                      </tfoot>
                    </table>
                  </Card>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Zahlungen ({payments.length})</Label>
                    {sel.doc_kind === 'invoice' && sel.payment_status !== 'cancelled' && (
                      <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                        <Wallet className="h-3 w-3 mr-1" /> Zahlung erfassen
                      </Button>
                    )}
                  </div>
                  <Card className="overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr><th className="text-left p-2">Datum</th><th className="text-right p-2">Betrag</th><th className="text-left p-2">Methode</th><th className="text-left p-2">Referenz</th><th className="text-left p-2">Notiz</th><th className="p-2 w-8" /></tr>
                      </thead>
                      <tbody>
                        {payments.length === 0 ? <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Noch keine Zahlungen</td></tr>
                        : payments.map(p => (
                          <tr key={p.id} className="border-t border-border/40">
                            <td className="p-2">{p.paid_on}</td>
                            <td className="p-2 text-right tabular-nums text-emerald-400">{currencyDe(p.amount, sel.currency)}</td>
                            <td className="p-2">{p.method || '—'}</td>
                            <td className="p-2">{p.reference || '—'}</td>
                            <td className="p-2 text-muted-foreground">{p.note || '—'}</td>
                            <td className="p-2 text-right">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => {
                                if (!confirm('Zahlung löschen?')) return;
                                await (supabase.from('invoice_payments' as any).delete().eq('id', p.id)) as any;
                                reopen(); load();
                              }}>×</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>

                <div><Label className="text-xs">Notizen</Label><Textarea rows={2} value={sel.notes || ''} onChange={e => setSel({...sel, notes: e.target.value})} /></div>
              </div>
            )}
            <DialogFooter className="flex-wrap gap-2">
              {sel && sel.doc_kind === 'invoice' && sel.payment_status !== 'cancelled' && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setCreditOpen('storno')}><Ban className="h-4 w-4 mr-1" /> Stornieren</Button>
                  <Button variant="outline" size="sm" onClick={() => setCreditOpen('credit_note')}><RotateCcw className="h-4 w-4 mr-1" /> Gutschrift</Button>
                </>
              )}
              {items.length > 0 && sel && <ErpDocPdfButton type="rechnung" id={sel.id} label="PDF (MTCON)" />}
              {items.length > 0 && sel && <Button variant="outline" size="sm" onClick={downloadXRechnung}><FileCode className="h-4 w-4 mr-1" /> XRechnung</Button>}
              <Button variant="outline" onClick={() => setSel(null)}>Schließen</Button>
              <Button onClick={save} disabled={sel?.locked}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {sel && (
          <>
            <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} invoice={sel} onSaved={() => { reopen(); load(); }} />
            <CreditOrStornoDialog kind={creditOpen} onClose={() => setCreditOpen(null)} invoice={sel} items={items} onCreated={() => { setCreditOpen(null); setSel(null); load(); }} />
          </>
        )}
      </div>
    </AppLayout>
  );
}

async function openInvoice(
  i: Invoice,
  setSel: (i: Invoice) => void,
  setItems: (v: InvItem[]) => void,
  setPayments: (v: Payment[]) => void,
) {
  setSel(i);
  const [{ data: itemsData }, { data: payData }] = await Promise.all([
    (supabase.from('invoice_items' as any).select('*').eq('invoice_id', i.id).order('position')) as any,
    (supabase.from('invoice_payments' as any).select('*').eq('invoice_id', i.id).order('paid_on', { ascending: false })) as any,
  ]);
  setItems((itemsData as InvItem[]) || []);
  setPayments((payData as Payment[]) || []);
}

function PaymentDialog({ open, onClose, invoice, onSaved }: { open: boolean; onClose: () => void; invoice: Invoice; onSaved: () => void }) {
  const openAmount = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
  const [amount, setAmount] = useState<string>('');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0,10));
  const [method, setMethod] = useState('Überweisung');
  const [reference, setReference] = useState(invoice.invoice_no);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setAmount(openAmount.toFixed(2)); setReference(invoice.invoice_no); setNote(''); }
  }, [open, openAmount, invoice.invoice_no]);

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error('Betrag erforderlich');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('invoice_payments' as any).insert({
      invoice_id: invoice.id, amount: amt, paid_on: paidOn, method, reference, note, created_by: user?.id ?? null,
    })) as any;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Zahlung erfasst');
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
          <DialogDescription>Offener Betrag: {currencyDe(openAmount, invoice.currency)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Betrag</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label className="text-xs">Zahlungsdatum</Label><Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></div>
          <div><Label className="text-xs">Methode</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Überweisung">Überweisung</SelectItem>
                <SelectItem value="Lastschrift">Lastschrift</SelectItem>
                <SelectItem value="Bar">Bar</SelectItem>
                <SelectItem value="Kreditkarte">Kreditkarte</SelectItem>
                <SelectItem value="PayPal">PayPal</SelectItem>
                <SelectItem value="Verrechnung">Verrechnung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Referenz / Buchungstext</Label><Input value={reference} onChange={e => setReference(e.target.value)} /></div>
          <div><Label className="text-xs">Notiz</Label><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Speichert…' : 'Buchen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditOrStornoDialog({ kind, onClose, invoice, items, onCreated }: {
  kind: 'storno' | 'credit_note' | null; onClose: () => void; invoice: Invoice; items: InvItem[]; onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const isStorno = kind === 'storno';

  const create = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const today = new Date().toISOString().slice(0,10);
    const factor = -1;
    const subtotal = items.reduce((s, it) => s + factor * Number(it.line_total || 0), 0);
    const tax = items.reduce((s, it) => s + factor * Number(it.line_total || 0) * Number(it.tax_rate || 0) / 100, 0);
    const total = subtotal + tax;

    const insertPayload: any = {
      order_id: invoice.order_id, delivery_id: null,
      status: 'sent',
      doc_kind: isStorno ? 'storno' : 'credit_note',
      invoice_date: today,
      customer_name: invoice.customer_name, customer_email: invoice.customer_email, customer_no: invoice.customer_no,
      billing_address: invoice.billing_address, currency: invoice.currency,
      subtotal_amount: subtotal, tax_amount: tax, total_amount: total,
      payment_terms_days: 0, tax_mode: invoice.tax_mode,
      notes: reason ? `${isStorno ? 'Stornogrund' : 'Gutschriftgrund'}: ${reason}` : null,
      created_by: user?.id ?? null,
    };
    if (isStorno) insertPayload.storno_of_invoice_id = invoice.id;
    else insertPayload.credit_note_of_invoice_id = invoice.id;

    const { data: newInv, error } = await (supabase.from('invoices' as any).insert(insertPayload).select().single()) as any;
    if (error || !newInv) { setBusy(false); return toast.error(error?.message || 'Fehler'); }

    if (items.length) {
      await (supabase.from('invoice_items' as any).insert(items.map(it => ({
        invoice_id: newInv.id, position: it.position, art_nr: it.art_nr, description: it.description,
        quantity: it.quantity, unit: it.unit, unit_price: it.unit_price,
        tax_rate: it.tax_rate, line_total: factor * Number(it.line_total || 0),
      })))) as any;
    }

    if (isStorno) {
      // Original als storniert markieren
      await (supabase.from('invoices' as any).update({ payment_status: 'cancelled', status: 'cancelled' }).eq('id', invoice.id)) as any;
    }
    setBusy(false);
    toast.success(`${isStorno ? 'Storno' : 'Gutschrift'} ${newInv.invoice_no} erstellt`);
    onCreated();
  };

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isStorno ? 'Rechnung stornieren' : 'Gutschrift erstellen'}</DialogTitle>
          <DialogDescription>
            {isStorno
              ? `Storno-Rechnung mit negativen Positionen wird auf ${invoice.invoice_no} verbucht. Original wird als storniert markiert.`
              : `Gutschrift mit negativen Positionen wird als eigenständiger Beleg zu ${invoice.invoice_no} erzeugt.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Grund</Label><Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="z.B. Falschlieferung, Reklamation, Fehlbuchung" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={create} disabled={busy} variant={isStorno ? 'destructive' : 'default'}>{busy ? 'Erstellt…' : (isStorno ? 'Stornieren' : 'Gutschrift erstellen')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateInvoiceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [sourceType, setSourceType] = useState<'order' | 'delivery'>('order');
  const [list, setList] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSourceId('');
    (async () => {
      if (sourceType === 'order') {
        const { data } = await supabase.from('orders').select('id, order_no, customer_name, customer_email, customer_no').order('created_at', { ascending: false }).limit(100);
        setList(data || []);
      } else {
        const { data } = await (supabase.from('deliveries' as any).select('id, delivery_no, order_id, orders(order_no, customer_name, customer_email, customer_no)').eq('status', 'shipped').order('created_at', { ascending: false }).limit(100)) as any;
        setList(data || []);
      }
    })();
  }, [open, sourceType]);

  const create = async () => {
    if (!sourceId) return toast.error('Quelle wählen');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const src = list.find(x => x.id === sourceId);
    const orderId = sourceType === 'order' ? sourceId : src?.order_id || null;
    const cust = sourceType === 'order' ? src : src?.orders;
    const today = new Date();

    let itemsToCopy: any[] = [];
    if (sourceType === 'order') {
      const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId).order('position');
      itemsToCopy = (data || []).map((it: any) => ({
        position: it.position, art_nr: it.art_nr || it.sku, description: it.description,
        quantity: Number(it.quantity), unit: it.unit, unit_price: it.unit_price != null ? Number(it.unit_price) : null,
        tax_rate: it.tax_rate != null ? Number(it.tax_rate) : 19,
        line_total: it.line_total != null ? Number(it.line_total) : (Number(it.quantity) * Number(it.unit_price || 0)),
      }));
    } else {
      const { data: di } = await (supabase.from('delivery_items' as any).select('*').eq('delivery_id', sourceId).order('position')) as any;
      const orderItemIds = (di || []).map((x: any) => x.order_item_id).filter(Boolean);
      const { data: oi } = orderItemIds.length ? await supabase.from('order_items').select('*').in('id', orderItemIds) : { data: [] as any[] };
      const priceMap = new Map((oi || []).map((x: any) => [x.id, x]));
      itemsToCopy = (di || []).map((it: any, idx: number) => {
        const ref = priceMap.get(it.order_item_id);
        const qty = Number(it.quantity); const up = ref?.unit_price != null ? Number(ref.unit_price) : null;
        return {
          position: it.position || idx+1, art_nr: it.art_nr, description: it.description,
          quantity: qty, unit: it.unit, unit_price: up,
          tax_rate: ref?.tax_rate != null ? Number(ref.tax_rate) : 19,
          line_total: up != null ? qty * up : null,
        };
      });
    }

    const subtotal = itemsToCopy.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
    const tax = itemsToCopy.reduce((s, it) => s + (Number(it.line_total) || 0) * (Number(it.tax_rate || 0) / 100), 0);
    const total = subtotal + tax;

    const { data: inv, error } = await (supabase.from('invoices' as any).insert({
      order_id: orderId,
      delivery_id: sourceType === 'delivery' ? sourceId : null,
      status: 'draft', doc_kind: 'invoice',
      invoice_date: today.toISOString().slice(0,10),
      payment_terms_days: 14, tax_mode: 'standard',
      customer_name: cust?.customer_name || null,
      customer_email: cust?.customer_email || null,
      customer_no: cust?.customer_no || null,
      currency: 'EUR',
      subtotal_amount: subtotal, tax_amount: tax, total_amount: total,
      created_by: user?.id ?? null,
    }).select().single()) as any;

    if (error || !inv) { setBusy(false); return toast.error(error?.message || 'Fehler'); }
    if (itemsToCopy.length) {
      await (supabase.from('invoice_items' as any).insert(itemsToCopy.map(it => ({ ...it, invoice_id: inv.id })))) as any;
    }
    setBusy(false);
    toast.success(`Rechnung ${inv.invoice_no} erstellt`);
    onCreated(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Rechnung</DialogTitle>
          <DialogDescription>Positionen, Preise und USt. werden übernommen. Fälligkeit setzt sich aus Zahlungsziel (14 Tage Default).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={sourceType==='order'?'default':'outline'} onClick={() => setSourceType('order')}>Aus Bestellung</Button>
            <Button type="button" size="sm" variant={sourceType==='delivery'?'default':'outline'} onClick={() => setSourceType('delivery')}>Aus Lieferschein</Button>
          </div>
          <div>
            <Label className="text-xs">{sourceType === 'order' ? 'Bestellung' : 'Lieferschein'}</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {list.map((x: any) => (
                  <SelectItem key={x.id} value={x.id}>
                    {sourceType === 'order'
                      ? `${x.order_no} · ${x.customer_name || '—'}`
                      : `${x.delivery_no} · ${x.orders?.order_no || ''} · ${x.orders?.customer_name || '—'}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={create} disabled={busy}>{busy ? 'Erstellt…' : 'Erstellen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
