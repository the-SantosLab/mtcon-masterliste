import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatEUR } from '@/lib/crm';
import { copyItems, type CopiedItem } from '@/lib/copyOfferItems';

export function CopyOfferItemsDialog({ open, onClose, offerId, companyId, startAt, onCopy }: {
  open: boolean; onClose: () => void; offerId: string; companyId?: string | null; startAt: number; onCopy: (items: CopiedItem[]) => void;
}) {
  const [source, setSource] = useState<'offer' | 'order'>('offer');
  const [onlyCompany, setOnlyCompany] = useState(!!companyId);
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setBusy(true);
      const s = supabase as any;
      let query = source === 'offer'
        ? s.from('offers').select('id, offer_no, total, status, created_at, company_id').neq('id', offerId)
        : s.from('orders').select('id, order_no, customer_name, total_amount, created_at, company_id');
      if (onlyCompany && companyId) query = query.eq('company_id', companyId);
      const { data } = await query.order('created_at', { ascending: false }).limit(200);
      setList(data ?? []); setBusy(false);
    })();
  }, [open, source, onlyCompany, companyId, offerId]);

  const pick = async (row: any) => {
    setBusy(true);
    const { data, error } = source === 'offer'
      ? await supabase.from('offer_items').select('*').eq('offer_id', row.id)
      : await supabase.from('order_items').select('*').eq('order_id', row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error('Keine Positionen vorhanden');
    onCopy(copyItems(source, data, startAt));
    toast.success(`${data.length} Position(en) übernommen – bitte speichern`);
    onClose();
  };

  const filtered = list.filter(r => !q || JSON.stringify([r.offer_no, r.order_no, r.status, r.customer_name]).toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Positionen übernehmen</DialogTitle>
          <DialogDescription>Positionen aus einem früheren Angebot oder Auftrag werden unten angehängt.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={source === 'offer' ? 'default' : 'outline'} onClick={() => setSource('offer')}>Aus Angebot</Button>
          <Button size="sm" variant={source === 'order' ? 'default' : 'outline'} onClick={() => setSource('order')}>Aus Auftrag</Button>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Suchen…" value={q} onChange={e => setQ(e.target.value)} className="h-8 text-xs" />
          {companyId && <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={() => setOnlyCompany(v => !v)}>{onlyCompany ? 'Nur diese Firma' : 'Alle Firmen'}</Button>}
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {busy ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            : filtered.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Keine Einträge.</p>
            : filtered.map(r => (
              <button key={r.id} onClick={() => pick(r)} className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2 text-left text-xs last:border-0 hover:bg-muted/50">
                <span className="min-w-0 truncate"><span className="text-foreground">{r.offer_no ?? r.order_no ?? '–'}</span> <span className="text-muted-foreground">{r.customer_name ?? r.status ?? ''}</span></span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatEUR(r.total ?? r.total_amount ?? 0)} · {new Date(r.created_at).toLocaleDateString('de-DE')}</span>
              </button>
            ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Schließen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
