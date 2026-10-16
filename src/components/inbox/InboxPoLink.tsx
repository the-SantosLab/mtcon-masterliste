import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { suggestPurchaseOrders, type PoCandidate } from '@/lib/inboxPoMatch';

export function InboxPoLink({ doc, code, extracted, onLinked }: {
  doc: { id: string; subject: string | null; filename: string | null; from_name: string | null };
  code: string; extracted: Record<string, any>; onLinked: () => void;
}) {
  const [pos, setPos] = useState<PoCandidate[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from('purchase_orders')
        .select('id, po_no, status, suppliers(name), purchase_order_items(qty_ordered, unit_price)')
        .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(500)) as any;
      setPos((data || []).map((p: any) => ({
        id: p.id, po_no: p.po_no, status: p.status, supplier_name: p.suppliers?.name ?? null,
        total: (p.purchase_order_items || []).reduce((s: number, i: any) => s + Number(i.qty_ordered || 0) * Number(i.unit_price || 0), 0) || null,
      })));
    })();
  }, []);

  const suggestions = useMemo(() => suggestPurchaseOrders({ extracted, ...doc }, pos), [extracted, pos, doc]);
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return pos.filter((p) => (p.po_no || '').toLowerCase().includes(s) || (p.supplier_name || '').toLowerCase().includes(s)).slice(0, 8);
  }, [q, pos]);

  const link = async (po: PoCandidate) => {
    setBusy(po.id);
    // Vorher bearbeitete Felder speichern, damit die Zuordnung die korrigierten Werte nutzt
    await (supabase as any).from('inbox_documents').update({ extracted_data: extracted }).eq('id', doc.id);
    const { error } = await (supabase.rpc as any)('link_inbox_document_to_po', { _doc_id: doc.id, _po_id: po.id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(code === 'invoice'
      ? `Eingangsrechnung zu ${po.po_no} angelegt und abgeglichen`
      : `Auftragsbestätigung bei ${po.po_no} hinterlegt`);
    onLinked();
  };

  const Row = ({ p, reasons }: { p: PoCandidate; reasons?: string[] }) => (
    <div className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs">
      <span className="font-mono">{p.po_no}</span>
      <span className="text-muted-foreground truncate flex-1">{p.supplier_name || '—'}</span>
      {reasons?.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
      <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!!busy} onClick={() => link(p)}>
        {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}Zuordnen
      </Button>
    </div>
  );

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label className="text-xs">Bestellung zuordnen</Label>
      <p className="text-[11px] text-muted-foreground">
        {code === 'invoice'
          ? 'Legt eine Eingangsrechnung mit den Bestellpositionen an und startet den Abgleich.'
          : 'Überträgt AB-Datum und bestätigten Liefertermin in die Bestellung.'}
      </p>
      {suggestions.length > 0
        ? suggestions.map((p) => <Row key={p.id} p={p} reasons={p.reasons} />)
        : <p className="text-[11px] text-muted-foreground">Kein passender Vorschlag gefunden.</p>}
      <Input placeholder="Bestellnummer oder Lieferant suchen" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs" />
      {searched.map((p) => <Row key={p.id} p={p} />)}
    </div>
  );
}
