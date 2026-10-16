import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { FinanceHeader } from '@/components/erp/FinanceHeader';
import { FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import { formatEUR } from '@/lib/crm';
import { parseCsv, parseCamt, matchPayments, type Match, type OpenInvoice } from '@/lib/bankMatch';

export default function BankReconciliation() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState('');

  const onFile = async (f: File) => {
    setBusy(true); setFile(f.name);
    const text = await f.text();
    const txs = /<\?xml|<Document/i.test(text.slice(0, 500)) ? parseCamt(text) : parseCsv(text);
    const { data } = await (supabase as any).from('invoices').select('id, invoice_no, customer_name, total_amount, paid_amount, status')
      .not('status', 'in', '(draft,cancelled)').limit(2000);
    const open: OpenInvoice[] = (data ?? []).map((i: any) => ({ id: i.id, invoice_no: i.invoice_no, customer_name: i.customer_name, open: Math.round(((i.total_amount ?? 0) - (i.paid_amount ?? 0)) * 100) / 100 }))
      .filter((i: OpenInvoice) => i.open > 0.01);
    const { data: prev } = await (supabase as any).from('invoice_payments').select('reference').like('reference', 'BANK|%').limit(5000);
    setBooked(new Set((prev ?? []).map((p: any) => p.reference.slice(5))));
    const m = matchPayments(txs, open);
    setMatches(m);
    setPick(new Set(m.filter(x => x.invoice).map(x => x.tx.key)));
    setBusy(false);
    if (!txs.length) toast.error('Keine Zahlungseingänge in der Datei gefunden');
  };

  const book = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const rows = matches.filter(m => m.invoice && pick.has(m.tx.key) && !booked.has(m.tx.key)).map(m => ({
      invoice_id: m.invoice!.id, amount: Math.min(m.tx.amount, m.invoice!.open), paid_on: m.tx.date, method: 'bank',
      reference: `BANK|${m.tx.key}`, note: m.tx.text.slice(0, 200), created_by: user?.id ?? null,
    }));
    const { error } = rows.length ? await (supabase as any).from('invoice_payments').insert(rows) : { error: null };
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} Zahlung(en) verbucht`);
    setBooked(new Set([...booked, ...rows.map(r => r.reference.slice(5))]));
  };

  const found = matches.filter(m => m.invoice).length;
  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1400px]">
        <FinanceHeader title="Bankabgleich" subtitle="Kontoauszug (CSV oder CAMT.053) hochladen, Zahlungseingänge den offenen Rechnungen zuordnen und bestätigen."
          actions={<label className="inline-flex"><input type="file" accept=".csv,.txt,.xml" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button asChild size="sm" className="h-8 text-xs gap-1.5"><span>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Kontoauszug hochladen</span></Button></label>} />
        <FulfillmentMetrics metrics={[
          { label: 'Zahlungseingänge', value: matches.length, detail: file || 'keine Datei' },
          { label: 'Zugeordnet', value: found, tone: 'done' },
          { label: 'Ohne Zuordnung', value: matches.length - found, tone: matches.length - found ? 'overdue' : undefined },
          { label: 'Bereits verbucht', value: matches.filter(m => booked.has(m.tx.key)).length },
        ]} />
        {matches.length > 0 && <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr>
                <th className="w-8 px-2 py-2" /><th className="px-2 py-2 text-left font-medium">Datum</th><th className="px-2 py-2 text-right font-medium">Betrag</th>
                <th className="px-2 py-2 text-left font-medium">Text</th><th className="px-2 py-2 text-left font-medium">Rechnung</th><th className="px-2 py-2 text-left font-medium">Grund</th></tr></thead>
              <tbody>{matches.map(m => {
                const done = booked.has(m.tx.key);
                return <tr key={m.tx.key} className="border-t border-border">
                  <td className="px-2 py-2"><Checkbox disabled={!m.invoice || done} checked={pick.has(m.tx.key) && !done}
                    onCheckedChange={v => { const n = new Set(pick); v ? n.add(m.tx.key) : n.delete(m.tx.key); setPick(n); }} /></td>
                  <td className="px-2 py-2 tabular-nums">{new Date(m.tx.date).toLocaleDateString('de-DE')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatEUR(m.tx.amount)}</td>
                  <td className="px-2 py-2 max-w-[360px] truncate text-muted-foreground">{m.tx.text}</td>
                  <td className="px-2 py-2">{m.invoice ? <>{m.invoice.invoice_no} · {m.invoice.customer_name} <span className="text-muted-foreground">(offen {formatEUR(m.invoice.open)})</span></> : <span className="text-muted-foreground">–</span>}</td>
                  <td className="px-2 py-2">{done ? <Badge variant="outline">verbucht</Badge> : m.reason ? <Badge variant="outline">{m.reason}</Badge> : <Badge variant="outline" className="text-destructive">manuell prüfen</Badge>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="flex justify-end"><Button size="sm" disabled={busy || ![...pick].some(k => !booked.has(k))} onClick={book}>Ausgewählte Zahlungen verbuchen</Button></div>
        </>}
      </div>
    </AppLayout>
  );
}
